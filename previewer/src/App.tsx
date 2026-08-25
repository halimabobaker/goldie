import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Strip } from "./components/Strip";
import { type BundledFont, loadManifest, type StoreManifest } from "./manifest";

export function App() {
  const [manifest, setManifest] = useState<StoreManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then(setManifest)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <Empty message={error} />;
  if (!manifest) return <Empty message="Loading…" />;
  return <Loaded manifest={manifest} />;
}

/**
 * All design state lives here as plain React state: the strip composites the
 * scenes in the browser, so a background or frame change repaints instantly.
 * The CLI only runs when the sidebar's Export button asks for the final files.
 */
function Loaded({ manifest }: { manifest: StoreManifest }) {
  const design = manifest.design;

  const [device, setDevice] = useState(manifest.devices[0]?.key ?? "");
  const [locale, setLocale] = useState(manifest.locales[0] ?? "");
  const [dark, setDark] = useState(new URLSearchParams(window.location.search).get("dark") === "1");
  const [background, setBackground] = useState(design.theme.background);
  const [frame, setFrame] = useState(design.frameVariant ?? "");
  const [fontFamily, setFontFamily] = useState(design.theme.fontFamily);

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

      <main className="grid flex-1 place-items-center overflow-auto p-10">
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
            />
          </div>
        ) : (
          <Empty message={`No raw captures for ${device}. Run: bun src/cli.ts capture`} />
        )}
      </main>
    </div>
  );
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
