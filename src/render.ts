import { mkdir, writeFile, readFile, stat, rm } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { createCanvas, loadImage, type CanvasGradient, type SKRSContext2D } from "@napi-rs/canvas";
import { execOrThrow, exec } from "./exec.ts";
import { DEVICES, PREVIEW, SCREENSHOT_PIXEL_FORMAT, type DeviceKey } from "./specs.ts";
import { framePath, isPreview, isScreenshot, type LoadedConfig } from "./config.ts";
import { layout } from "./frame.ts";
import type { CaptureManifest } from "./capture.ts";

async function readManifest(cfg: LoadedConfig, deviceKey: DeviceKey): Promise<CaptureManifest> {
  const file = join(cfg.outDir, "raw", deviceKey, "manifest.json");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new Error(`No capture manifest at ${file}. Run: goldie capture`);
  }
}

/**
 * Composites each raw screenshot into the bezel on the theme background with
 * the scene copy above it. Drawn with a 2D canvas: the geometry comes from
 * frame.ts and the type sizes mirror the previewer's ScreenshotScene, so the
 * export is what the browser showed.
 */
export async function renderScreenshots(cfg: LoadedConfig, deviceKey: DeviceKey, locale: string) {
  const spec = DEVICES[deviceKey];
  const manifest = await readManifest(cfg, deviceKey);
  const outDir = join(cfg.outDir, "screenshots", spec.label, locale);
  await mkdir(outDir, { recursive: true });
  const bezel = await loadImage(framePath(cfg));

  const { width, height } = spec.screenshot;
  const copyHeight = height * cfg.theme.copyHeightRatio;
  const { frame, screen } = layout({ width, height }, cfg.theme.deviceWidthRatio, copyHeight, height * 0.03);

  const scenes = cfg.scenes.filter(isScreenshot);
  return Promise.all(scenes.map(async (scene, index) => {
    const shot = manifest.screenshots.find((s) => s.sceneId === scene.id);
    if (!shot) throw new Error(`Scene "${scene.id}" is in the config but not in the capture manifest.`);
    console.log(`  frame ${scene.id}`);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = paint(ctx, scene.background ?? cfg.theme.background, width, height);
    ctx.fillRect(0, 0, width, height);

    // Copy block: headline, then the subhead, centred inside the copy area.
    const padX = width * 0.09;
    let y = height * 0.055;
    y = drawText(ctx, {
      text: pick(scene.headline, locale, scene.id, "headline"),
      font: `700 ${width * 0.082}px ${cfg.theme.fontFamily}`,
      color: cfg.theme.headlineColor,
      lineHeight: 1.08,
      letterSpacing: -width * 0.0016,
      x: width / 2, y, maxWidth: width - 2 * padX,
    });
    if (scene.subhead) {
      drawText(ctx, {
        text: pick(scene.subhead, locale, scene.id, "subhead"),
        font: `400 ${width * 0.038}px ${cfg.theme.fontFamily}`,
        color: cfg.theme.subheadColor,
        lineHeight: 1.3,
        letterSpacing: 0,
        x: width / 2, y: y + height * 0.014, maxWidth: width - 2 * padX,
      });
    }

    // Screen first, bezel on top: the bezel's cutout is transparent.
    const capture = await loadImage(shot.file);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(screen.left, screen.top, screen.width, screen.height, screen.borderRadius);
    ctx.clip();
    const scale = Math.max(screen.width / capture.width, screen.height / capture.height);
    const w = capture.width * scale;
    const h = capture.height * scale;
    ctx.drawImage(capture, screen.left + (screen.width - w) / 2, screen.top + (screen.height - h) / 2, w, h);
    ctx.restore();
    ctx.drawImage(bezel, frame.left, frame.top, frame.width, frame.height);

    // App Store rejects screenshots carrying an alpha channel, and the canvas
    // always encodes RGBA, so ffmpeg strips it on the way out.
    const raw = join(outDir, `.${scene.id}.rgba.png`);
    await writeFile(raw, await canvas.encode("png"));
    const final = join(outDir, `${String(index + 1).padStart(2, "0")}-${scene.id}.png`);
    await execOrThrow("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-pix_fmt", SCREENSHOT_PIXEL_FORMAT, final]);
    await rm(raw, { force: true });
    return final;
  }));
}

/**
 * Word-wraps and draws centred text starting at `y`. Returns the y below the
 * last line.
 */
function drawText(
  ctx: SKRSContext2D,
  o: { text: string; font: string; color: string; lineHeight: number; letterSpacing: number; x: number; y: number; maxWidth: number },
): number {
  ctx.font = o.font;
  ctx.fillStyle = o.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.letterSpacing = `${o.letterSpacing}px`;
  const size = Number(o.font.match(/(\d+(?:\.\d+)?)px/)?.[1]);
  const step = size * o.lineHeight;

  const lines: string[] = [];
  for (const paragraph of o.text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > o.maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }

  let y = o.y;
  for (const line of lines) {
    // Centre the glyph box inside the line box, as CSS line-height does.
    ctx.fillText(line, o.x, y + (step - size) / 2);
    y += step;
  }
  return y;
}

/**
 * A canvas fill for a CSS background: a plain color, or a `linear-gradient()`
 * with an optional angle / `to <side>` and color stops with optional
 * percentages. Anything else is handed to the canvas as-is.
 */
function paint(ctx: SKRSContext2D, css: string, width: number, height: number): string | CanvasGradient {
  const m = css.trim().match(/^linear-gradient\((.*)\)$/s);
  if (!m) return css;
  const parts = splitTopLevel(m[1]!);

  let angle = 180;
  const first = parts[0]!.trim();
  const deg = first.match(/^(-?\d+(?:\.\d+)?)deg$/);
  if (deg) {
    angle = Number(deg[1]);
    parts.shift();
  } else if (first.startsWith("to ")) {
    const sides: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 };
    const words = first.slice(3).split(/\s+/);
    const angles = words.map((w) => sides[w]).filter((a): a is number => a !== undefined);
    if (angles.length === 2 && angles.includes(0) && angles.includes(270)) angle = 315;
    else if (angles.length === 2) angle = (angles[0]! + angles[1]!) / 2;
    else if (angles.length === 1) angle = angles[0]!;
    parts.shift();
  }

  // CSS gradient line: through the centre, long enough that the corners meet
  // the first and last stop exactly.
  const rad = (angle * Math.PI) / 180;
  const length = Math.abs(width * Math.sin(rad)) + Math.abs(height * Math.cos(rad));
  const dx = (Math.sin(rad) * length) / 2;
  const dy = (-Math.cos(rad) * length) / 2;
  const gradient = ctx.createLinearGradient(width / 2 - dx, height / 2 - dy, width / 2 + dx, height / 2 + dy);

  const stops = parts.map((p) => {
    const s = p.trim().match(/^(.*?)(?:\s+(-?\d+(?:\.\d+)?)%)?$/);
    return { color: s![1]!.trim(), at: s![2] !== undefined ? Number(s![2]) / 100 : undefined };
  });
  if (stops.length && stops[0]!.at === undefined) stops[0]!.at = 0;
  if (stops.length && stops[stops.length - 1]!.at === undefined) stops[stops.length - 1]!.at = 1;
  for (let i = 0; i < stops.length; i++) {
    if (stops[i]!.at !== undefined) continue;
    let j = i;
    while (stops[j]!.at === undefined) j++;
    const from = stops[i - 1]!.at!;
    const to = stops[j]!.at!;
    for (let k = i; k < j; k++) stops[k]!.at = from + ((to - from) * (k - i + 1)) / (j - i + 1);
  }
  let last = 0;
  for (const s of stops) {
    last = Math.min(1, Math.max(last, s.at!));
    gradient.addColorStop(last, s.color);
  }
  return gradient;
}

/** Splits on commas that are not inside parentheses (rgb(), hsl()). */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Joins the raw segment clips into one plain screen recording at the upload
 * size. App Store previews must be the device screen and nothing else, so no
 * bezel, background or captions are added; only an audio track, which Apple
 * requires even when it is silent.
 */
export async function renderPreview(cfg: LoadedConfig, deviceKey: DeviceKey, locale: string) {
  const spec = DEVICES[deviceKey];
  const scene = cfg.scenes.find(isPreview);
  if (!scene) return null;
  const manifest = await readManifest(cfg, deviceKey);
  if (!manifest.preview) throw new Error("No preview clips in the capture manifest. Run: goldie capture");

  const clips = scene.segments.map((segment) => {
    const clip = manifest.preview!.clips.find((c) => c.segmentId === segment.id);
    if (!clip) throw new Error(`Segment "${segment.id}" is in the config but not in the capture manifest.`);
    return clip;
  });

  const seconds = clips.reduce((s, c) => s + c.durationSeconds, 0);
  if (seconds < PREVIEW.minSeconds || seconds > PREVIEW.maxSeconds) {
    throw new Error(
      `Preview is ${seconds.toFixed(1)}s; Apple requires ${PREVIEW.minSeconds}-${PREVIEW.maxSeconds}s. ` +
        `Adjust the segment flows or their holdSeconds and re-capture.`,
    );
  }

  const outDir = join(cfg.outDir, "previews", spec.label, locale);
  await mkdir(outDir, { recursive: true });
  const list = join(outDir, `.${scene.id}.clips.txt`);
  await writeFile(list, clips.map((c) => `file '${c.file.replace(/'/g, "'\\''")}'`).join("\n"));
  const final = join(outDir, `${scene.id}.mp4`);

  const { width, height } = spec.preview;
  const audio = scene.audio
    ? ["-i", resolve(cfg.root, scene.audio), "-filter:a", "volume=0.35"]
    : ["-f", "lavfi", "-i", `anullsrc=r=${PREVIEW.audioSampleRate}:cl=stereo`];

  console.log(`  render preview (${seconds.toFixed(1)}s)`);
  await execOrThrow("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", list,
    ...audio,
    "-map", "0:v:0", "-map", "1:a:0",
    // Cover the upload size and crop the sliver the aspect ratios disagree on.
    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},fps=${PREVIEW.fps},format=yuv420p`,
    "-c:v", "libx264", "-profile:v", "high", "-b:v", PREVIEW.videoBitrate,
    "-c:a", "aac", "-b:a", PREVIEW.audioBitrate, "-ar", String(PREVIEW.audioSampleRate),
    "-shortest", "-movflags", "+faststart",
    final,
  ]);
  await rm(list, { force: true });

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
