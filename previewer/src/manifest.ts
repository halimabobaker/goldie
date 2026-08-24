/** Mirrors the StoreManifest that `gilded manifest` writes to out/store.json. */

export type ScreenshotAsset = {
  sceneId: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
};

export type PreviewAsset = {
  sceneId: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  durationSeconds: number;
  captions: string[];
};

export type LocaleAssets = { screenshots: ScreenshotAsset[]; preview: PreviewAsset | null };

export type DeviceEntry = {
  key: string;
  label: string;
  simulatorName: string;
  screenshot: { width: number; height: number };
  preview: { width: number; height: number };
};

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
  devices: DeviceEntry[];
  locales: string[];
  assets: Record<string, Record<string, LocaleAssets>>;
  generation?: {
    background: string;
    frameVariant: string | null;
    frameVariants: string[];
  };
};

export async function loadManifest(): Promise<StoreManifest> {
  const res = await fetch("/store.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      "No out/store.json. Generate the assets first:  bun src/cli.ts all  (or  bun src/cli.ts manifest)",
    );
  }
  const manifest: StoreManifest = await res.json();

  // Regenerated files keep their names, so the generation timestamp becomes a
  // cache-buster - a regenerate followed by a manifest reload shows new pixels.
  const v = `?v=${Date.parse(manifest.generatedAt) || 0}`;
  for (const byLocale of Object.values(manifest.assets)) {
    for (const assets of Object.values(byLocale)) {
      for (const shot of assets.screenshots) shot.url += v;
      if (assets.preview) assets.preview.url += v;
    }
  }
  return manifest;
}
