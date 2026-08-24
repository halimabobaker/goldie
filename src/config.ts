import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DeviceKey } from "./specs.ts";

/** Bezel art bundled in gilded's own assets/, one PNG per variant. */
export const FRAME_VARIANTS = ["17-pro-silver", "17-pro-blue", "17-pro-orange"] as const;
export type FrameVariant = (typeof FRAME_VARIANTS)[number];

export type Locale = string;

/** One still screenshot: a flow that navigates somewhere, plus the marketing copy around it. */
export type ScreenshotScene = {
  kind: "screenshot";
  id: string;
  /** Flow in the app's `.argent/flows`: a name ("home") or a path under it ("gilded/home.yaml"). Its final step captures the screenshot. */
  flow: string;
  /** Headline per locale. */
  headline: Record<Locale, string>;
  subhead?: Record<Locale, string>;
  /** Overrides the theme background for this scene. */
  background?: string;
};

/**
 * The app preview video, built from short segments.
 *
 * Each segment is its own flow recorded into its own clip, so a caption's
 * on-screen timing is the clip's measured duration - exact by construction.
 * (Recording one long flow instead would mean hand-counting frames to place
 * captions, which is what ~/Dev/argent-remotion-flows/src/flow/timeline.ts
 * had to do.)
 */
export type PreviewScene = {
  kind: "preview";
  id: string;
  segments: Array<{
    id: string;
    /** Flow in the app's `.argent/flows`, same forms as a screenshot scene's. */
    flow: string;
    caption: Record<Locale, string>;
    /** Hold the last frame this long after the flow ends, in seconds. */
    holdSeconds?: number;
  }>;
  /** Optional audio bed relative to the config file. A silent AAC track is written when absent. */
  audio?: string;
};

export type Scene = ScreenshotScene | PreviewScene;

export type Theme = {
  background: string;
  headlineColor: string;
  subheadColor: string;
  fontFamily: string;
  /** Fraction of the frame height reserved for copy above the device. */
  copyHeightRatio: number;
  /** Fraction of the frame width the device bezel occupies. */
  deviceWidthRatio: number;
};

/**
 * How the app presents itself on the App Store. Used by the previewer to
 * render a realistic product page around the generated assets - it is the
 * surrounding chrome that tells you whether a headline still reads at
 * gallery size.
 */
export type StoreListing = {
  name: string;
  subtitle: Record<Locale, string>;
  developer: string;
  category: string;
  /** Shown in the ratings row; purely cosmetic. */
  rating: number;
  ratingCount: string;
  ageRating: string;
  price: string;
  description: Record<Locale, string>;
};

export type GildedConfig = {
  /** Absolute path to the app repo. Holds `.argent/flows`; also used for messages and for locating the build. */
  appRoot: string;
  /**
   * Where the scene flows live. Defaults to `.argent/flows` inside `appRoot`,
   * so gilded and argent share one flow store: anything recorded with
   * `argent flow record` is replayable here by name, and vice versa. An
   * absolute path or a path relative to the config file overrides it.
   */
  flowsDir?: string;
  /** Simulator .app bundle to install. */
  appPath: string;
  bundleId: string;
  devices: DeviceKey[];
  locales: Locale[];
  /** Simulator appearance for every capture. */
  appearance: "light" | "dark";
  /**
   * Device bezel art. Either a bundled variant from assets/ (all variants
   * share the cutout geometry in remotion/frame.ts) or a custom PNG with a
   * transparent screen cutout, relative to the config file. Custom art means
   * re-measuring the geometry in remotion/frame.ts.
   */
  frame: { variant: FrameVariant } | { image: string };
  theme: Theme;
  store: StoreListing;
  scenes: Scene[];
};

export type LoadedConfig = GildedConfig & {
  /** Directory the config file lives in; every relative path resolves against it. */
  root: string;
  /** Absolute directory the scene flows resolve against. */
  flowsDir: string;
  outDir: string;
};

/**
 * Default config path: the GILDED_CONFIG env var when set, else
 * ./gilded.config.ts. The env var lets a config live in the app's own repo
 * while gilded and its previewer run from this checkout.
 */
export function defaultConfigPath(): string {
  return process.env.GILDED_CONFIG
    ? resolve(process.env.GILDED_CONFIG)
    : resolve(process.cwd(), "gilded.config.ts");
}

export async function loadConfig(path = defaultConfigPath()): Promise<LoadedConfig> {
  if (!existsSync(path)) throw new Error(`No config at ${path}`);
  const mod = await import(path);
  const cfg: GildedConfig = mod.default ?? mod.config;
  if (!cfg) throw new Error(`${path} has no default export`);
  const root = dirname(path);
  const loaded: LoadedConfig = {
    ...cfg,
    root,
    flowsDir: cfg.flowsDir ? resolve(root, cfg.flowsDir) : resolve(cfg.appRoot, ".argent/flows"),
    outDir: resolve(root, "out"),
  };
  framePath(loaded); // fail at load time on a bad variant or missing bezel PNG
  return loaded;
}

const GILDED_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Absolute path to a bundled bezel variant's PNG. */
export function variantFramePath(variant: FrameVariant): string {
  return resolve(GILDED_ROOT, "assets", `${variant}.png`);
}

/** Absolute path to the bezel PNG the config selects. */
export function framePath(cfg: LoadedConfig): string {
  let file: string;
  if ("variant" in cfg.frame) {
    if (!FRAME_VARIANTS.includes(cfg.frame.variant)) {
      throw new Error(
        `Unknown frame variant "${cfg.frame.variant}". Available: ${FRAME_VARIANTS.join(", ")}`,
      );
    }
    file = variantFramePath(cfg.frame.variant);
  } else {
    file = resolve(cfg.root, cfg.frame.image);
  }
  if (!existsSync(file)) throw new Error(`Frame image not found: ${file}`);
  return file;
}

/**
 * Absolute path to a scene's flow YAML. A name or a relative path resolves
 * against `flowsDir`; `.yaml` is added when the value has no extension.
 */
export function flowPath(cfg: LoadedConfig, flow: string): string {
  const file = flow.endsWith(".yaml") || flow.endsWith(".yml") ? flow : `${flow}.yaml`;
  return resolve(cfg.flowsDir, file);
}

export const isPreview = (s: Scene): s is PreviewScene => s.kind === "preview";
export const isScreenshot = (s: Scene): s is ScreenshotScene => s.kind === "screenshot";
