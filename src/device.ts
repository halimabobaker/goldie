import { join } from "node:path";
import { homedir } from "node:os";
import { exec, execOrThrow } from "./exec.ts";
import * as argent from "./argent.ts";
import { DEVICES, type DeviceKey } from "./specs.ts";

type SimDevice = { udid: string; name: string; state: string; isAvailable?: boolean };

async function simctlDevices(): Promise<Record<string, SimDevice[]>> {
  const r = await execOrThrow("xcrun", ["simctl", "list", "devices", "available", "--json"]);
  return JSON.parse(r.stdout).devices as Record<string, SimDevice[]>;
}

/** Newest-runtime simulator matching the device spec's name. */
export async function resolveUdid(key: DeviceKey): Promise<string> {
  const spec = DEVICES[key];
  const byRuntime = await simctlDevices();
  const runtimes = Object.keys(byRuntime)
    .filter((r) => r.includes("iOS"))
    .sort(compareRuntime);
  for (const runtime of runtimes) {
    const hit = byRuntime[runtime]?.find((d) => d.name === spec.simulatorName);
    if (hit) return hit.udid;
  }
  throw new Error(
    `No "${spec.simulatorName}" simulator installed. Add one in Xcode > Settings > Components, ` +
      `or run: xcrun simctl create "${spec.simulatorName}" "${spec.simulatorName}"`,
  );
}

/** Sorts iOS runtime identifiers newest-first ("...iOS-18-5" before "...iOS-18-3"). */
function compareRuntime(a: string, b: string): number {
  const nums = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
  const [an, bn] = [nums(a), nums(b)];
  for (let i = 0; i < Math.max(an.length, bn.length); i++) {
    const d = (bn[i] ?? 0) - (an[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export async function boot(udid: string): Promise<void> {
  await argent.run("boot-device", { udid });
}

export async function shutdown(udid: string): Promise<void> {
  await exec("xcrun", ["simctl", "shutdown", udid], { quiet: true });
}

/**
 * Autocorrect and predictive text rewrite typed strings mid-flow - a title
 * typed as "Sync conflicts when editing offline" came back as
 * "Synu cofnelibysmy when emitent offline" on a simulator with a non-English
 * keyboard. Pinning the language and turning both off makes typed copy exact.
 *
 * Written straight into the shut-down device's preference store rather than
 * via `simctl spawn defaults`: preferences are read at process start, so the
 * booted-write path needs a reboot, and rebooting mid-session leaves argent's
 * transport pointed at a simulator that no longer exists (every later launch
 * then fails its native-devtools handshake).
 */
export async function pinKeyboardAndLocale(udid: string, locale: string): Promise<void> {
  const language = locale.split("-")[0];
  const prefs = join(
    homedir(),
    "Library/Developer/CoreSimulator/Devices",
    udid,
    "data/Library/Preferences",
  );
  const write = (domain: string, args: string[]) =>
    execOrThrow("defaults", ["write", join(prefs, domain), ...args]);

  await write("com.apple.Preferences", ["KeyboardAutocorrection", "-bool", "false"]);
  await write("com.apple.Preferences", ["KeyboardPrediction", "-bool", "false"]);
  await write("com.apple.Preferences", ["KeyboardAutocapitalization", "-bool", "false"]);
  await write("com.apple.keyboard.preferences", ["KeyboardAutocorrection", "-bool", "false"]);
  await write("com.apple.keyboard.preferences", ["KeyboardPrediction", "-bool", "false"]);
  await write(".GlobalPreferences", ["AppleLocale", "-string", locale.replace("-", "_")]);
  await write(".GlobalPreferences", ["AppleLanguages", "-array", language]);
}

/**
 * Pin the status bar to Apple's marketing state.
 * argent pins it only during snapshot runs and exposes no tool for it, so this
 * shells out to simctl directly. Must run after boot.
 */
export async function pinStatusBar(udid: string): Promise<void> {
  await execOrThrow("xcrun", [
    "simctl", "status_bar", udid, "override",
    "--time", "9:41",
    "--batteryState", "charged",
    "--batteryLevel", "100",
    "--wifiMode", "active",
    "--wifiBars", "3",
    "--cellularMode", "active",
    "--cellularBars", "4",
    "--dataNetwork", "5g",
  ]);
}

export async function clearStatusBar(udid: string): Promise<void> {
  await exec("xcrun", ["simctl", "status_bar", udid, "clear"], { quiet: true });
}

export async function setAppearance(udid: string, appearance: "light" | "dark"): Promise<void> {
  await execOrThrow("xcrun", ["simctl", "ui", udid, "appearance", appearance]);
}

/** Shut the device down, pin its preferences, boot it into a known state. */
export async function prepare(udid: string, locale: string, appearance: "light" | "dark"): Promise<void> {
  await argent.run("stop-simulator-server", { udid }).catch(() => {});
  await shutdown(udid);
  await pinKeyboardAndLocale(udid, locale);
  await boot(udid);
  await argent.restartServer();
  await setAppearance(udid, appearance);
  await pinStatusBar(udid);
}

export async function warmUp(udid: string, bundleId: string): Promise<void> {
  await argent.run("launch-app", { udid, bundleId }).catch(() => {});
  await argent.run("await-screen-idle", { udid, timeoutMs: 60000 }).catch(() => {});
}

export async function installApp(udid: string, appPath: string, bundleId: string): Promise<void> {
  await argent.run("reinstall-app", { udid, bundleId, appPath });
}
