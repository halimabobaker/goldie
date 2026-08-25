#!/usr/bin/env bun
import { loadConfig, framePath, isScreenshot, type LoadedConfig, type FrameVariant } from "./config.ts";
import { capture } from "./capture.ts";
import { renderScreenshots, renderPreview, verify } from "./render.ts";
import { doctor } from "./doctor.ts";
import { writeManifest } from "./manifest.ts";
import { FlowFailure, repairBrief } from "./repair.ts";
import * as device from "./device.ts";
import type { DeviceKey } from "./specs.ts";

const USAGE = `
gilded - App Store screenshots and previews, driven by argent

  gilded doctor     Check the toolchain, simulators, flags and flows
  gilded capture    Replay every scene flow and save raw captures
  gilded frame      Composite raw screenshots into framed, captioned PNGs
  gilded preview    Join the raw clips into the app preview video
  gilded verify     Check finished assets against Apple's spec table
  gilded manifest   Write out/store.json for the previewer app
  gilded all        capture -> frame -> preview -> manifest -> verify

Options
  --config <path>   Config file (default ./gilded.config.ts)
  --device <key>    Only this device key (default: every device in the config)
  --locale <code>   Only this locale (default: every locale in the config)
  --background <css>  Override theme.background for this run (also clears per-scene backgrounds)
  --frame <variant>   Override the screenshot bezel variant for this run (17-pro-silver | 17-pro-blue | 17-pro-orange)
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

  const cfg = await loadConfig(opt("config") ? Bun.resolveSync(opt("config")!, process.cwd()) : undefined);

  // One-run overrides, used by the previewer's regenerate endpoint. The config
  // file stays the source of truth; copy a value there to keep it.
  const background = opt("background");
  if (background) {
    cfg.theme.background = background;
    for (const scene of cfg.scenes) if (isScreenshot(scene)) scene.background = undefined;
    // The config's copy colors assume its own background; a dark override
    // would render near-black headlines on a near-black gradient.
    if (isDarkBackground(background)) {
      cfg.theme.headlineColor = "#FFFFFF";
      cfg.theme.subheadColor = "#D9E1EA";
    }
  }
  const frame = opt("frame");
  if (frame) {
    cfg.frame = { variant: frame as FrameVariant };
    framePath(cfg); // throws on an unknown variant
  }

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

/**
 * Mean relative luminance of the background's hex stops, below 0.5 counts as
 * dark. Backgrounds without six-digit hex colors keep the config's copy colors.
 */
function isDarkBackground(css: string): boolean {
  const hexes = css.match(/#[0-9a-fA-F]{6}/g);
  if (!hexes || hexes.length === 0) return false;
  const luminance = (hex: string) => {
    const channel = (offset: number) => {
      const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  return hexes.reduce((sum, hex) => sum + luminance(hex), 0) / hexes.length < 0.5;
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
