import { mkdir, copyFile, writeFile, stat, readdir, symlink, rm, readFile } from "node:fs/promises";
import { join, resolve, basename, relative, dirname } from "node:path";
import { execOrThrow } from "./exec.ts";
import { DEVICES, type DeviceKey } from "./specs.ts";
import {
  FRAME_VARIANTS,
  framePath,
  variantFramePath,
  isPreview,
  isScreenshot,
  type LoadedConfig,
  type Theme,
} from "./config.ts";
import type { CaptureManifest } from "./capture.ts";

/**
 * `out/web/` - the previewer's static root. It holds the manifest, the app
 * icon, the bezel art, and symlinks to the finished assets and the raw
 * captures. The raw captures and bezels are what the previewer composites in
 * the browser (instant background/frame changes); the finished files under
 * screenshots/ and previews/ are what an export zips up.
 *
 * The `design` section carries everything the browser-side composition needs:
 * the theme, each scene's copy, and per-device raw capture urls. `assets`
 * still records the finished files so tooling can see what was last rendered.
 */
export type StoreManifest = {
  generatedAt: string;
  app: {
    name: string;
    subtitle: Record<string, string>;
    developer: string;
    category: string;
    icon: string;
    rating: number;
    ratingCount: string;
    ageRating: string;
    price: string;
    description: Record<string, string>;
  };
  devices: Array<{
    key: DeviceKey;
    label: string;
    simulatorName: string;
    screenshot: { width: number; height: number };
    preview: { width: number; height: number };
  }>;
  locales: string[];
  /** Keyed by device key, then locale. */
  assets: Record<string, Record<string, LocaleAssets>>;
  /** Everything the previewer needs to composite scenes in the browser. */
  design: {
    theme: Theme;
    /** null when the config points at custom bezel art. */
    frameVariant: string | null;
    frameVariants: string[];
    /** Url of the config's custom bezel art; null when a bundled variant is used. */
    customFrameUrl: string | null;
    scenes: Array<{
      id: string;
      headline: Record<string, string>;
      subhead?: Record<string, string>;
    }>;
    preview: {
      sceneId: string;
      segments: Array<{ id: string; caption: Record<string, string> }>;
    } | null;
    /** Raw capture urls per device key; a device is absent until `gilded capture` ran. */
    captures: Record<
      string,
      {
        screenshots: Array<{ sceneId: string; url: string }>;
        clips: Array<{ segmentId: string; url: string; durationSeconds: number }> | null;
      }
    >;
  };
};

export type LocaleAssets = {
  screenshots: Array<{ sceneId: string; url: string; width: number; height: number; bytes: number }>;
  preview: {
    sceneId: string;
    url: string;
    width: number;
    height: number;
    bytes: number;
    durationSeconds: number;
    captions: string[];
  } | null;
};

export const WEB_DIR = "web";

export async function writeManifest(cfg: LoadedConfig): Promise<string> {
  const webDir = join(cfg.outDir, WEB_DIR);
  await mkdir(webDir, { recursive: true });
  await copyFile(resolve(cfg.root, cfg.store.icon), join(webDir, "icon.png"));
  await link(join(cfg.outDir, "screenshots"), join(webDir, "screenshots"));
  await link(join(cfg.outDir, "previews"), join(webDir, "previews"));

  const assets: StoreManifest["assets"] = {};
  for (const deviceKey of cfg.devices) {
    assets[deviceKey] = {};
    for (const locale of cfg.locales) {
      assets[deviceKey][locale] = await collect(cfg, deviceKey, locale);
    }
  }

  const manifest: StoreManifest = {
    generatedAt: new Date().toISOString(),
    app: { ...cfg.store, icon: "icon.png" },
    devices: cfg.devices.map((key) => ({
      key,
      label: DEVICES[key].label,
      simulatorName: DEVICES[key].simulatorName,
      screenshot: DEVICES[key].screenshot,
      preview: DEVICES[key].preview,
    })),
    locales: cfg.locales,
    assets,
    generation: {
      background: cfg.theme.background,
      frameVariant: "variant" in cfg.frame ? cfg.frame.variant : null,
      frameVariants: [...FRAME_VARIANTS],
    },
  };

  const file = join(webDir, "store.json");
  await writeFile(file, JSON.stringify(manifest, null, 2));
  return file;
}

async function collect(cfg: LoadedConfig, deviceKey: DeviceKey, locale: string): Promise<LocaleAssets> {
  const label = DEVICES[deviceKey].label;
  const shotDir = join(cfg.outDir, "screenshots", label, locale);
  const previewDir = join(cfg.outDir, "previews", label, locale);
  const sceneOrder = cfg.scenes.filter(isScreenshot).map((s) => s.id);

  const screenshots: LocaleAssets["screenshots"] = [];
  for (const name of (await ls(shotDir)).filter((f) => f.endsWith(".png")).sort()) {
    const file = join(shotDir, name);
    const { width, height } = await imageSize(file);
    // Files are named "<index>-<sceneId>.png".
    const sceneId = sceneOrder.find((id) => name.includes(id)) ?? basename(name, ".png");
    screenshots.push({
      sceneId,
      url: `screenshots/${label}/${locale}/${name}`,
      width,
      height,
      bytes: (await stat(file)).size,
    });
  }

  const previewScene = cfg.scenes.find(isPreview);
  const previewName = (await ls(previewDir)).find((f) => f.endsWith(".mp4"));
  let preview: LocaleAssets["preview"] = null;
  if (previewScene && previewName) {
    const file = join(previewDir, previewName);
    const probe = await videoInfo(file);
    preview = {
      sceneId: previewScene.id,
      url: `previews/${label}/${locale}/${previewName}`,
      ...probe,
      bytes: (await stat(file)).size,
      captions: previewScene.segments.map((s) => s.caption[locale] ?? ""),
    };
  }

  return { screenshots, preview };
}

const ls = async (dir: string) => readdir(dir).catch(() => [] as string[]);

/** Relative symlink, replaced on every run so a moved out/ never goes stale. */
async function link(target: string, path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
  await symlink(relative(dirname(path), target), path, "dir");
}

async function imageSize(file: string) {
  const r = await execOrThrow("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
  return {
    width: Number(r.stdout.match(/pixelWidth:\s*(\d+)/)?.[1]),
    height: Number(r.stdout.match(/pixelHeight:\s*(\d+)/)?.[1]),
  };
}

async function videoInfo(file: string) {
  const r = await execOrThrow("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json", file,
  ]);
  const probe = JSON.parse(r.stdout);
  return {
    width: probe.streams[0].width as number,
    height: probe.streams[0].height as number,
    durationSeconds: Number(probe.format.duration),
  };
}
