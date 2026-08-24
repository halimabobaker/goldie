/** Mirrors the StoreManifest that `gilded manifest` writes to out/store.json. */

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

export type DeviceEntry = {
  key: string;
  label: string;
  simulatorName: string;
  screenshot: { width: number; height: number };
  preview: { width: number; height: number };
};

export type DesignScene = {
  id: string;
  headline: Record<string, string>;
  subhead?: Record<string, string>;
};

export type DeviceCaptures = {
  screenshots: Array<{ sceneId: string; url: string }>;
  clips: Array<{ segmentId: string; url: string; durationSeconds: number }> | null;
};

export type Design = {
  theme: Theme;
  /** null when the config points at custom bezel art. */
  frameVariant: string | null;
  frameVariants: string[];
  customFrameUrl: string | null;
  scenes: DesignScene[];
  preview: {
    sceneId: string;
    segments: Array<{ id: string; caption: Record<string, string> }>;
  } | null;
  /** Raw capture urls per device key; a device is absent until `gilded capture` ran. */
  captures: Record<string, DeviceCaptures>;
};

export type StoreManifest = {
  generatedAt: string;
  app: {
    name: string;
    subtitle: Record<string, string>;
    developer: string;
    category: string;
    rating: number;
    ratingCount: string;
    ageRating: string;
    price: string;
    description: Record<string, string>;
  };
  devices: DeviceEntry[];
  locales: string[];
  design: Design;
};

export async function loadManifest(): Promise<StoreManifest> {
  const res = await fetch("/store.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      "No out/store.json. Generate the assets first:  bun src/cli.ts all  (or  bun src/cli.ts manifest)",
    );
  }
  const manifest: StoreManifest = await res.json();
  if (!manifest.design) {
    throw new Error("out/store.json predates browser-side composition. Re-run: bun src/cli.ts manifest");
  }

  // Raw captures keep their names across a re-capture, so the manifest's
  // timestamp becomes a cache-buster - a capture followed by a manifest
  // reload shows new pixels.
  const v = `?v=${Date.parse(manifest.generatedAt) || 0}`;
  for (const captures of Object.values(manifest.design.captures)) {
    for (const shot of captures.screenshots) shot.url += v;
    for (const clip of captures.clips ?? []) clip.url += v;
  }
  return manifest;
}
