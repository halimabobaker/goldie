import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Strip } from "./components/Strip";
import {
  type BundledFont,
  loadDesign,
  loadManifest,
  type SavedDesign,
  type SceneCopy,
  type StoreManifest,
  saveDesign,
} from "./manifest";

/** How long the design must sit still before it is written to disk. */
const SAVE_DEBOUNCE_MS = 500;

export function App() {
  const [loaded, setLoaded] = useState<{ manifest: StoreManifest; design: SavedDesign } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadManifest(), loadDesign()])
      .then(([manifest, design]) => setLoaded({ manifest, design }))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <Empty message={error} />;
  if (!loaded) return <Empty message="Loading…" />;
  return <Loaded manifest={loaded.manifest} saved={loaded.design} />;
}

/**
 * All design state lives here as plain React state: the strip composites the
 * scenes in the browser, so a background or frame change repaints instantly.
 * The CLI only runs when the sidebar's Export button asks for the final files.
 *
 * Two things survive a reload. The design choices (background, frame, font,
 * copy edited in the lightbox)
 * are written to goldie.design.json next to the config, debounced, so the
 * CLI picks them up too. The view choices (device, locale, dark) only matter
 * here and live in localStorage under the app's name. Either falls back to
 * the config when a stored value no longer applies (a device or frame
 * variant removed from the config, for instance).
 */
function Loaded({ manifest, saved }: { manifest: StoreManifest; saved: SavedDesign }) {
  const design = manifest.design;
  const view = loadView(manifest.app.name);
  const [device, setDevice] = useState(
    manifest.devices.some((d) => d.key === view.device)
      ? (view.device as string)
      : (manifest.devices[0]?.key ?? ""),
  );
  const [locale, setLocale] = useState(
    view.locale && manifest.locales.includes(view.locale)
      ? view.locale
      : (manifest.locales[0] ?? ""),
  );
  const [dark, setDark] = useState(
    new URLSearchParams(window.location.search).get("dark") === "1" || view.dark === true,
  );
  const [background, setBackground] = useState(saved.background ?? design.theme.background);
  const [frame, setFrame] = useState(
    saved.frame && design.frameVariants.includes(saved.frame)
      ? saved.frame
      : (design.frameVariant ?? ""),
  );
  const [fontFamily, setFontFamily] = useState(saved.fontFamily ?? design.theme.fontFamily);
  const [copy, setCopy] = useState<Record<string, SceneCopy>>(saved.copy ?? {});
  const setSceneCopy = (sceneId: string, field: "headline" | "subhead", text: string) =>
    setCopy((prev) => ({
      ...prev,
      [sceneId]: { ...prev[sceneId], [field]: { ...prev[sceneId]?.[field], [locale]: text } },
    }));

  useEffect(() => {
    storeView(manifest.app.name, { device, locale, dark });
  }, [manifest.app.name, device, locale, dark]);

  // Write the design to disk once it has sat still for a moment; a drag on
  // the gradient picker fires many changes a second. Skips the initial mount
  // so opening the studio never creates the file by itself. An empty frame
  // means the config's custom bezel art, which has nothing to save.
  const [saveError, setSaveError] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const timer = setTimeout(() => {
      saveDesign({
        background,
        frame: frame || undefined,
        fontFamily,
        copy: Object.keys(copy).length > 0 ? copy : undefined,
      }).then(
        () => setSaveError(null),
        (e: Error) => setSaveError(e.message),
      );
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [background, frame, fontFamily, copy]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // The bundled typefaces' @font-face rules, declared once in <head>.
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = fontFaces(design.fonts);
    document.head.append(style);
    return () => style.remove();
  }, [design.fonts]);

  const spec = manifest.devices.find((d) => d.key === device);
  const captures = design.captures[device];
  const frameUrl = frame
    ? `frames/${frame}.png`
    : (design.customFrameUrl ?? `frames/${design.frameVariants[0]}.png`);

  return (
    <div className="flex h-full bg-muted text-foreground">
      <Sidebar
        manifest={manifest}
        device={device}
        locale={locale}
        dark={dark}
        background={background}
        frame={frame}
        fontFamily={fontFamily}
        onDevice={setDevice}
        onLocale={setLocale}
        onDark={setDark}
        onBackground={setBackground}
        onFrame={setFrame}
        onFontFamily={setFontFamily}
      />

      <main className="relative grid flex-1 place-items-center overflow-auto p-10">
        {saveError ? (
          <p className="absolute top-3 right-3 rounded-md bg-destructive px-3 py-1.5 text-[12px] text-white">
            {saveError}
          </p>
        ) : null}
        {spec && captures ? (
          <div className="w-full max-w-[1400px]">
            <Strip
              design={design}
              captures={captures}
              spec={spec}
              locale={locale}
              background={background}
              frameUrl={frameUrl}
              fontFamily={fontFamily}
              copy={copy}
              onCopy={setSceneCopy}
            />
          </div>
        ) : (
          <Empty message={`No raw captures for ${device}. Run: bun src/cli.ts capture`} />
        )}
      </main>
    </div>
  );
}

type SavedView = { device?: string; locale?: string; dark?: boolean };

const storageKey = (appName: string) => `goldie-studio:${appName}`;

function loadView(appName: string): SavedView {
  try {
    const raw = localStorage.getItem(storageKey(appName));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as SavedView) : {};
  } catch {
    return {};
  }
}

function storeView(appName: string, saved: SavedView): void {
  try {
    localStorage.setItem(storageKey(appName), JSON.stringify(saved));
  } catch {
    // Storage may be unavailable (private mode); the session still works.
  }
}

/** @font-face rules for the bundled typefaces the manifest lists. */
function fontFaces(fonts: BundledFont[]): string {
  return fonts
    .flatMap((font) =>
      font.faces.map(
        (face) =>
          `@font-face{font-family:"${font.family}";font-weight:${face.weight};font-style:normal;src:url("${face.url}") format("truetype")}`,
      ),
    )
    .join("\n");
}

function Empty({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center bg-muted px-10 text-center">
      <p className="max-w-md whitespace-pre-line text-[14px] leading-relaxed text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
