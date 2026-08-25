import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as argent from "./argent.ts";
import { flowPath, type LoadedConfig } from "./config.ts";
import * as device from "./device.ts";
import { exec } from "./exec.ts";
import { DEVICES } from "./specs.ts";

type Check = { name: string; ok: boolean; detail: string; fix?: string; warnOnly?: boolean };

async function onPath(bin: string, args: string[] = ["--version"]): Promise<boolean> {
  return (await exec(bin, args, { quiet: true })).code === 0;
}

export async function doctor(cfg: LoadedConfig): Promise<boolean> {
  const checks: Check[] = [];

  checks.push({
    name: "xcrun",
    ok: await onPath("xcrun", ["simctl", "help"]),
    detail: "iOS simulator control",
    fix: "Install Xcode and run: xcode-select --install",
  });
  checks.push({
    name: "ffmpeg",
    ok: await onPath("ffmpeg", ["-version"]),
    detail: "recording and pixel-format conversion",
    fix: "brew install ffmpeg",
  });
  checks.push({
    name: "ffprobe",
    ok: await onPath("ffprobe", ["-version"]),
    detail: "output verification",
    fix: "brew install ffmpeg",
  });
  checks.push({
    name: "argent",
    ok: await argent.available(),
    detail: "device driver",
    fix: "npm i -g @swmansion/argent   (or set GOLDIE_ARGENT_BIN)",
  });

  // The watermark flag is ON by default and would brand every preview.
  const watermarkOff = await argent.watermarkDisabled().catch(() => false);
  checks.push({
    name: "video-watermark",
    ok: watermarkOff,
    detail: watermarkOff ? "disabled" : "ENABLED - previews would carry the argent watermark",
    fix: "argent disable video-watermark",
  });

  // A host-wide screenshot scale would silently downscale every capture.
  const scale = process.env.ARGENT_SCREENSHOT_SCALE;
  checks.push({
    name: "ARGENT_SCREENSHOT_SCALE",
    ok: scale === undefined || Number(scale) === 1,
    detail: scale ? `set to ${scale}` : "unset (captures pass scale=1.0 explicitly)",
    fix: "unset ARGENT_SCREENSHOT_SCALE",
  });

  const appPath = resolve(cfg.root, cfg.appPath);
  checks.push({
    name: "app build",
    ok: existsSync(appPath),
    detail: appPath,
    fix: `Build it: (cd ${cfg.appRoot} && npx expo run:ios --configuration Release)`,
  });

  // A Debug build needs Metro running and paints LogBox banners over the UI -
  // both end up in the captures.
  const isDebug = /Debug-iphonesimulator/.test(appPath);
  checks.push({
    name: "release build",
    ok: !isDebug,
    warnOnly: true,
    detail: isDebug
      ? "app is a Debug build: it requires Metro and paints dev warning banners into captures"
      : "release build",
    fix: `(cd ${cfg.appRoot} && npx expo run:ios --configuration Release) then point appPath at the Release-iphonesimulator .app`,
  });

  for (const key of cfg.devices) {
    const spec = DEVICES[key];
    const udid = await device.resolveUdid(key).catch(() => null);
    checks.push({
      name: `simulator ${spec.simulatorName}`,
      ok: Boolean(udid),
      detail: udid ?? "not installed",
      fix: `xcrun simctl create "${spec.simulatorName}" "${spec.simulatorName}"`,
    });
  }

  checks.push({
    name: "flows dir",
    ok: existsSync(cfg.flowsDir),
    detail: cfg.flowsDir,
    fix: `mkdir -p ${cfg.flowsDir}   (or set flowsDir in goldie.config.ts)`,
  });

  for (const scene of cfg.scenes) {
    const flows = scene.kind === "preview" ? scene.segments.map((s) => s.flow) : [scene.flow];
    for (const f of flows) {
      const path = flowPath(cfg, f);
      checks.push({
        name: `flow ${f}`,
        ok: existsSync(path),
        detail: path,
        fix: "Record or author it under the flows dir, or fix the name in goldie.config.ts",
      });
    }
  }

  let allOk = true;
  for (const c of checks) {
    if (!c.ok && !c.warnOnly) allOk = false;
    const label = c.ok ? "  ok  " : c.warnOnly ? "  warn" : "  FAIL";
    console.log(`${label} ${c.name.padEnd(30)} ${c.detail}`);
    if (!c.ok && c.fix) console.log(`       fix: ${c.fix}`);
  }
  return allOk;
}
