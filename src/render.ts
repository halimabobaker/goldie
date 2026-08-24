import { mkdir, copyFile, writeFile, rm, readFile, stat } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { execOrThrow, exec } from "./exec.ts";
import { DEVICES, PREVIEW, SCREENSHOT_PIXEL_FORMAT, type DeviceKey } from "./specs.ts";
import { framePath, isPreview, isScreenshot, type LoadedConfig } from "./config.ts";
import type { CaptureManifest } from "./capture.ts";

const ENTRY = "remotion/index.ts";

async function readManifest(cfg: LoadedConfig, deviceKey: DeviceKey): Promise<CaptureManifest> {
  const file = join(cfg.outDir, "raw", deviceKey, "manifest.json");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new Error(`No capture manifest at ${file}. Run: gilded capture`);
  }
}

/**
 * Remotion resolves staticFile() against one public dir and rejects ".."
 * segments, so every asset a render touches is copied into out/stage first.
 */
async function stage(cfg: LoadedConfig, files: string[]): Promise<string> {
  const dir = join(cfg.outDir, "stage");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await copyFile(framePath(cfg), join(dir, "frame.png"));
  for (const f of files) await copyFile(f, join(dir, basename(f)));
  return dir;
}

/**
 * Stills render at half scale as JPEG and ffmpeg upscales them back to the
 * spec size. Chrome paints a quarter of the pixels and skips PNG encoding,
 * which together with the shared bundle and browser below is what makes a
 * regenerate fast. Set the scale to 1 for pixel-exact final art.
 */
const STILL_SCALE = 0.5;
const STILL_JPEG_QUALITY = 80;

export async function renderScreenshots(cfg: LoadedConfig, deviceKey: DeviceKey, locale: string) {
  const spec = DEVICES[deviceKey];
  const manifest = await readManifest(cfg, deviceKey);
  const stageDir = await stage(cfg, manifest.screenshots.map((s) => s.file));
  const outDir = join(cfg.outDir, "screenshots", spec.label, locale);
  await mkdir(outDir, { recursive: true });

  const scenes = cfg.scenes.filter(isScreenshot);
  const jobs = scenes.map((scene, i) => {
    const shot = manifest.screenshots.find((s) => s.sceneId === scene.id);
    if (!shot) throw new Error(`Scene "${scene.id}" is in the config but not in the capture manifest.`);
    return {
      scene,
      index: i,
      props: {
        capture: basename(shot.file),
        headline: pick(scene.headline, locale, scene.id, "headline"),
        subhead: scene.subhead ? pick(scene.subhead, locale, scene.id, "subhead") : undefined,
        background: scene.background ?? cfg.theme.background,
        headlineColor: cfg.theme.headlineColor,
        subheadColor: cfg.theme.subheadColor,
        fontFamily: cfg.theme.fontFamily,
        copyHeightRatio: cfg.theme.copyHeightRatio,
        deviceWidthRatio: cfg.theme.deviceWidthRatio,
        width: spec.screenshot.width,
        height: spec.screenshot.height,
      },
    };
  });

  // One webpack bundle and one browser serve every scene; each render only
  // pays for its own page.
  console.log("  bundle remotion project");
  const serveUrl = await bundle({ entryPoint: resolve(cfg.root, ENTRY), publicDir: stageDir });
  const browser = await openBrowser("chrome");
  try {
    // renderStill draws the props resolved into the composition, so the
    // per-scene props must go through selectComposition, not just renderStill.
    // Resolved sequentially: concurrent selectComposition calls on one browser
    // hang in its setup phase, and each lookup is cheap anyway.
    const compositions = [];
    for (const { props } of jobs) {
      compositions.push(await selectComposition({
        serveUrl,
        id: "Screenshot",
        inputProps: props,
        puppeteerInstance: browser,
        logLevel: "error",
      }));
    }

    return await Promise.all(jobs.map(async ({ scene, index, props }, j) => {
      console.log(`  frame ${scene.id}`);
      const composition = compositions[j]!;
      const raw = join(stageDir, `${scene.id}.render.jpeg`);
      await renderStill({
        composition,
        serveUrl,
        output: raw,
        inputProps: props,
        imageFormat: "jpeg",
        jpegQuality: STILL_JPEG_QUALITY,
        scale: STILL_SCALE,
        puppeteerInstance: browser,
        logLevel: "error",
      });

      // App Store rejects screenshots carrying an alpha channel.
      const final = join(outDir, `${String(index + 1).padStart(2, "0")}-${scene.id}.png`);
      await execOrThrow("ffmpeg", [
        "-y", "-loglevel", "error", "-i", raw,
        "-vf", `scale=${spec.screenshot.width}:${spec.screenshot.height}:flags=lanczos`,
        "-pix_fmt", SCREENSHOT_PIXEL_FORMAT, final,
      ]);
      return final;
    }));
  } finally {
    await browser.close({ silent: true });
  }
}

export async function renderPreview(cfg: LoadedConfig, deviceKey: DeviceKey, locale: string) {
  const spec = DEVICES[deviceKey];
  const manifest = await readManifest(cfg, deviceKey);
  if (!manifest.preview) throw new Error("No preview clips in the capture manifest.");

  const scene = cfg.scenes.find(isPreview);
  if (!scene) throw new Error("No preview scene in the config.");

  const assets = manifest.preview.clips.map((c) => c.file);
  if (scene.audio) assets.push(resolve(cfg.root, scene.audio));
  const stageDir = await stage(cfg, assets);

  const clips = manifest.preview.clips.map((clip) => {
    const segment = scene.segments.find((s) => s.id === clip.segmentId);
    if (!segment) throw new Error(`Clip "${clip.segmentId}" has no matching segment in the config.`);
    return {
      file: basename(clip.file),
      caption: pick(segment.caption, locale, segment.id, "caption"),
      durationInFrames: Math.round(clip.durationSeconds * PREVIEW.fps),
    };
  });

  const seconds = clips.reduce((s, c) => s + c.durationInFrames, 0) / PREVIEW.fps;
  if (seconds < PREVIEW.minSeconds || seconds > PREVIEW.maxSeconds) {
    throw new Error(
      `Preview is ${seconds.toFixed(1)}s; Apple requires ${PREVIEW.minSeconds}-${PREVIEW.maxSeconds}s. ` +
        `Adjust the segment flows or their holdSeconds and re-capture.`,
    );
  }

  const props = {
    clips,
    audio: scene.audio ? basename(scene.audio) : undefined,
    background: cfg.theme.background,
    captionColor: cfg.theme.headlineColor,
    fontFamily: cfg.theme.fontFamily,
    copyHeightRatio: cfg.theme.copyHeightRatio,
    deviceWidthRatio: cfg.theme.deviceWidthRatio,
  };
  const propsFile = join(stageDir, "preview.props.json");
  await writeFile(propsFile, JSON.stringify(props));

  const outDir = join(cfg.outDir, "previews", spec.label, locale);
  await mkdir(outDir, { recursive: true });
  const final = join(outDir, `${scene.id}.mp4`);

  console.log(`  render preview (${seconds.toFixed(1)}s)`);
  await execOrThrow("bunx", [
    "remotion", "render", ENTRY, "Preview", final,
    `--props=${propsFile}`, `--public-dir=${stageDir}`,
    "--codec=h264",
    `--video-bitrate=${PREVIEW.videoBitrate}`,
    "--audio-codec=aac",
    `--audio-bitrate=${PREVIEW.audioBitrate}`,
    // Apple requires an enabled audio track even when the preview is silent.
    "--enforce-audio-track",
    "--log=error",
  ], { cwd: cfg.root });

  return final;
}

function pick(map: Record<string, string>, locale: string, sceneId: string, field: string): string {
  const value = map[locale];
  if (value === undefined) throw new Error(`Scene "${sceneId}" has no ${field} for locale "${locale}".`);
  return value;
}

/** Compares finished assets against the Apple spec table and prints a report. */
export async function verify(cfg: LoadedConfig, deviceKey: DeviceKey, locale: string): Promise<boolean> {
  const spec = DEVICES[deviceKey];
  let ok = true;

  const shotDir = join(cfg.outDir, "screenshots", spec.label, locale);
  const shots = await exec("sh", ["-c", `ls ${shotDir}/*.png 2>/dev/null`], { quiet: true });
  for (const file of shots.stdout.split("\n").filter(Boolean)) {
    const r = await execOrThrow("sips", ["-g", "pixelWidth", "-g", "pixelHeight", "-g", "hasAlpha", file]);
    const width = Number(r.stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
    const height = Number(r.stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
    const alpha = /hasAlpha:\s*yes/.test(r.stdout);
    const good = width === spec.screenshot.width && height === spec.screenshot.height && !alpha;
    ok &&= good;
    console.log(
      `  ${good ? "ok  " : "FAIL"} ${basename(file)}  ${width}x${height}` +
        `${alpha ? "  alpha channel present" : ""}` +
        `${good ? "" : `  expected ${spec.screenshot.width}x${spec.screenshot.height}, no alpha`}`,
    );
  }

  const previewDir = join(cfg.outDir, "previews", spec.label, locale);
  const videos = await exec("sh", ["-c", `ls ${previewDir}/*.mp4 2>/dev/null`], { quiet: true });
  for (const file of videos.stdout.split("\n").filter(Boolean)) {
    const r = await execOrThrow("ffprobe", [
      "-v", "error", "-show_entries",
      "stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels:format=duration",
      "-of", "json", file,
    ]);
    const probe = JSON.parse(r.stdout);
    const video = probe.streams.find((s: any) => s.codec_type === "video");
    const audio = probe.streams.find((s: any) => s.codec_type === "audio");
    const duration = Number(probe.format.duration);
    const fps = evalRatio(video?.avg_frame_rate ?? "0/1");
    const bytes = (await stat(file)).size;

    const checks: Array<[string, boolean, string]> = [
      ["size", video?.width === spec.preview.width && video?.height === spec.preview.height,
        `${video?.width}x${video?.height} (need ${spec.preview.width}x${spec.preview.height})`],
      ["codec", video?.codec_name === "h264", String(video?.codec_name)],
      ["fps", fps <= PREVIEW.fps + 0.01, fps.toFixed(2)],
      ["duration", duration >= PREVIEW.minSeconds && duration <= PREVIEW.maxSeconds, `${duration.toFixed(1)}s`],
      ["audio", Boolean(audio) && audio.codec_name === "aac", audio ? `${audio.codec_name} ${audio.sample_rate}Hz` : "none"],
      ["filesize", bytes <= PREVIEW.maxBytes, `${(bytes / 1024 / 1024).toFixed(1)} MB`],
    ];
    for (const [name, good, detail] of checks) {
      ok &&= good;
      console.log(`  ${good ? "ok  " : "FAIL"} ${basename(file)}  ${name}: ${detail}`);
    }
  }

  return ok;
}

const evalRatio = (r: string) => {
  const [n, d] = r.split("/").map(Number);
  return d ? n / d : 0;
};
