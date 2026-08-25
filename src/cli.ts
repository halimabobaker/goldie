#!/usr/bin/env bun
import { capture } from "./capture.ts";
import { applyDesign, type FrameVariant, type LoadedConfig, loadConfig } from "./config.ts";
import * as device from "./device.ts";
import { doctor } from "./doctor.ts";
import { FONT_KEYS, fontStack } from "./fonts.ts";
import { writeManifest } from "./manifest.ts";
import { renderPreview, renderScreenshots, verify } from "./render.ts";
import { FlowFailure, repairBrief } from "./repair.ts";
import type { DeviceKey } from "./specs.ts";

const USAGE = `
goldie - App Store screenshots and previews, driven by argent

  goldie doctor     Check the toolchain, simulators, flags and flows
  goldie capture    Replay every scene flow and save raw captures
  goldie frame      Composite raw screenshots into framed, captioned PNGs
  goldie preview    Join the raw clips into the app preview video
  goldie verify     Check finished assets against Apple's spec table
  goldie manifest   Write out/store.json for the previewer app
  goldie all        capture -> frame -> preview -> manifest -> verify

Options
  --config <path>   Config file (default ./goldie.config.ts)
  --device <key>    Only this device key (default: every device in the config)
  --locale <code>   Only this locale (default: every locale in the config)
  --background <css>  Override theme.background for this run (also clears per-scene backgrounds)
  --frame <variant>   Override the screenshot bezel variant for this run (17-pro-silver | 17-pro-blue | 17-pro-orange)
  --font <key>        Override theme.fontFamily for this run (system | ${FONT_KEYS.join(" | ")})
`;

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const opt = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };

  if (!command || command === "help" || command === "--help") {
    console.log(USAGE);
    return 0;
  }

  const cfg = await loadConfig(
    opt("config") ? Bun.resolveSync(opt("config")!, process.cwd()) : undefined,
  );

  // One-run overrides on top of the config and goldie.design.json (the
  // previewer's saved choices). Copy a value into the config to keep it.
  const font = opt("font");
  applyDesign(cfg, {
    background: opt("background"),
    frame: opt("frame") as FrameVariant | undefined,
    fontFamily: font ? fontStack(font) : undefined, // throws on an unknown key
  });

  const devices = (opt("device") ? [opt("device") as DeviceKey] : cfg.devices) as DeviceKey[];
  const locales = opt("locale") ? [opt("locale")!] : cfg.locales;

  switch (command) {
    case "doctor":
      return (await doctor(cfg)) ? 0 : 1;

    case "capture":
      await runCapture(cfg, devices);
      return 0;

    case "frame":
      for (const d of devices) for (const l of locales) await renderScreenshots(cfg, d, l);
      return 0;

    case "preview":
      for (const d of devices) for (const l of locales) await renderPreview(cfg, d, l);
      return 0;

    case "verify":
      return (await verifyAll(cfg, devices, locales)) ? 0 : 1;

    case "manifest":
      console.log(await writeManifest(cfg));
      return 0;

    case "all": {
      if (!(await doctor(cfg))) return 1;
      await runCapture(cfg, devices);
      for (const d of devices) {
        for (const l of locales) {
          await renderScreenshots(cfg, d, l);
          await renderPreview(cfg, d, l);
        }
      }
      await writeManifest(cfg);
      console.log("\nverify");
      return (await verifyAll(cfg, devices, locales)) ? 0 : 1;
    }

    default:
      console.error(`Unknown command "${command}"\n${USAGE}`);
      return 1;
  }
}

async function runCapture(cfg: LoadedConfig, devices: DeviceKey[]) {
  for (const d of devices) {
    const udid = await device.resolveUdid(d);
    try {
      await capture(cfg, d);
    } finally {
      // Leave the simulator as it was found; a pinned status bar is sticky.
      await device.clearStatusBar(udid);
    }
  }
}

async function verifyAll(cfg: LoadedConfig, devices: DeviceKey[], locales: string[]) {
  let ok = true;
  for (const d of devices) for (const l of locales) ok = (await verify(cfg, d, l)) && ok;
  return ok;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    if (err instanceof FlowFailure) {
      console.error(repairBrief(err));
      process.exit(2);
    }
    console.error(`\n${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  });
