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
type Pref = { domain: string; key: string; write: string[]; expect: string };

function keyboardAndLocalePrefs(locale: string): Pref[] {
  const language = locale.split("-")[0]!;
  const off = (domain: string, key: string): Pref => ({
    domain,
    key,
    write: ["-bool", "false"],
    expect: "0",
  });
  return [
    off("com.apple.Preferences", "KeyboardAutocorrection"),
    off("com.apple.Preferences", "KeyboardPrediction"),
    off("com.apple.Preferences", "KeyboardAutocapitalization"),
    off("com.apple.keyboard.preferences", "KeyboardAutocorrection"),
    off("com.apple.keyboard.preferences", "KeyboardPrediction"),
    {
      domain: ".GlobalPreferences",
      key: "AppleLocale",
      write: ["-string", locale.replace("-", "_")],
      expect: locale.replace("-", "_"),
    },
    {
      domain: ".GlobalPreferences",
      key: "AppleLanguages",
      write: ["-array", language],
      expect: `(${language})`,
    },
  ];
}

function prefsDir(udid: string): string {
  return join(
    homedir(),
    "Library/Developer/CoreSimulator/Devices",
    udid,
    "data/Library/Preferences",
  );
}

export async function pinKeyboardAndLocale(udid: string, locale: string): Promise<void> {
  const dir = prefsDir(udid);
  for (const pref of keyboardAndLocalePrefs(locale)) {
    await execOrThrow("defaults", ["write", join(dir, pref.domain), pref.key, ...pref.write]);
  }
}

/** Does the device's preference store already hold every pinned value? */
async function keyboardAndLocalePinned(udid: string, locale: string): Promise<boolean> {
  const dir = prefsDir(udid);
  for (const pref of keyboardAndLocalePrefs(locale)) {
    const r = await exec("defaults", ["read", join(dir, pref.domain), pref.key], { quiet: true });
    if (r.code !== 0) return false;
    if (r.stdout.replace(/\s+/g, "") !== pref.expect) return false;
  }
  return true;
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

/** Is the device booted right now? */
async function isBooted(udid: string): Promise<boolean> {
  const byRuntime = await simctlDevices();
  for (const list of Object.values(byRuntime)) {
    const hit = list.find((d) => d.udid === udid);
    if (hit) return hit.state === "Booted";
  }
  return false;
}

/**
 * Bring the device to a known state, reusing the running simulator when it is
 * already in one. A reboot is only worth its cost when the preference store
 * needs rewriting: preferences are read at process start, so a booted device
 * whose keyboard and locale are already pinned needs nothing but the appearance
 * and status bar applied. Rebooting also drops argent's transport session, so
 * an unnecessary one costs a tool-server restart on top of the boot itself.
 */
export async function prepare(udid: string, locale: string, appearance: "light" | "dark"): Promise<void> {
  const booted = await isBooted(udid);
  if (!booted || !(await keyboardAndLocalePinned(udid, locale))) {
    if (booted) console.log("  rebooting to pin the keyboard and locale");
    await argent.run("stop-simulator-server", { udid }).catch(() => {});
    await shutdown(udid);
    await pinKeyboardAndLocale(udid, locale);
    await boot(udid);
    await argent.restartServer();
  }
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
