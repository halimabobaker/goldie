import { type ReactNode, useState } from "react";
import { layout } from "../../../src/frame";
import type { Design, DeviceCaptures, DeviceEntry, Theme } from "../manifest";

/**
 * The five-up strip, composited in the browser: each screenshot tile is the
 * raw device capture inside the bezel art on the chosen background, laid out
 * with the exact geometry the CLI renders with (src/frame.ts), so what you see
 * is what an export renders. Background and frame arrive as props from React
 * state - changing them repaints instantly, no CLI involved. The preview tile
 * plays the raw clips as they are: Apple requires a plain screen recording.
 *
 * Every tile is a size-container: the geometry is computed in the device's
 * spec pixels and expressed in cqw/cqh, so the tile is the composition scaled
 * down. Captions under the tiles show the spec size the export will produce;
 * the video's turns red when the clips sum outside Apple's 15-30s window.
 */
export function Strip({
  design,
  captures,
  spec,
  locale,
  background,
  frameUrl,
}: {
  design: Design;
  captures: DeviceCaptures;
  spec: DeviceEntry;
  locale: string;
  background: string;
  frameUrl: string;
}) {
  const theme = design.theme;

  // Mirrors the CLI's --background handling: a dark background flips the copy
  // to light, and per-scene background overrides are dropped, so the export
  // matches what is on screen.
  const dark = isDarkBackground(background);
  const headlineColor = dark ? "#FFFFFF" : theme.headlineColor;
  const subheadColor = dark ? "#D9E1EA" : theme.subheadColor;

  const shots = design.scenes.flatMap((scene) => {
    const capture = captures.screenshots.find((s) => s.sceneId === scene.id);
    return capture ? [{ scene, capture }] : [];
  });

  const segments =
    design.preview && captures.clips
      ? design.preview.segments.flatMap((seg) => {
          const clip = captures.clips!.find((c) => c.segmentId === seg.id);
          return clip ? [{ url: clip.url, durationSeconds: clip.durationSeconds }] : [];
        })
      : [];

  const count = shots.length + (segments.length > 0 ? 1 : 0);
  if (count === 0) return null;

  const totalSeconds = segments.reduce((s, c) => s + c.durationSeconds, 0);

  return (
    <div
      className="grid w-full items-start gap-4"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {segments.length > 0 ? (
        <Tile
          width={spec.preview.width}
          height={spec.preview.height}
          caption={`${spec.preview.width}×${spec.preview.height} · ${totalSeconds.toFixed(1)}s`}
          bad={totalSeconds < 15 || totalSeconds > 30}
          badReason="Clips sum outside the 15-30s Apple allows for previews."
        >
          <PreviewScene segments={segments} />
        </Tile>
      ) : null}

      {shots.map(({ scene, capture }) => (
        <Tile
          key={scene.id}
          width={spec.screenshot.width}
          height={spec.screenshot.height}
          caption={`${spec.screenshot.width}×${spec.screenshot.height}`}
          bad={false}
        >
          <ScreenshotScene
            spec={spec.screenshot}
            theme={theme}
            background={background}
            frameUrl={frameUrl}
            headline={scene.headline[locale] ?? ""}
            subhead={scene.subhead?.[locale]}
            headlineColor={headlineColor}
            subheadColor={subheadColor}
            captureUrl={capture.url}
          />
        </Tile>
      ))}
    </div>
  );
}

/**
 * The composition geometry in container-query units: computed in spec pixels
 * with the shared layout(), then divided back out, so 1cqw = one percent of
 * the tile's width exactly as 1px-per-spec-pixel would be at full size.
 */
function geometry(spec: { width: number; height: number }, theme: Theme) {
  const copyHeight = spec.height * theme.copyHeightRatio;
  const g = layout(spec, theme.deviceWidthRatio, copyHeight, spec.height * 0.03);
  const w = (v: number) => `${(v / spec.width) * 100}cqw`;
  const h = (v: number) => `${(v / spec.height) * 100}cqh`;
  return {
    copyHeight: h(copyHeight),
    frame: {
      left: w(g.frame.left),
      top: h(g.frame.top),
      width: w(g.frame.width),
      height: h(g.frame.height),
    },
    screen: {
      left: w(g.screen.left),
      top: h(g.screen.top),
      width: w(g.screen.width),
      height: h(g.screen.height),
      borderRadius: w(g.screen.borderRadius),
    },
  };
}

function Canvas({
  background,
  fontFamily,
  children,
}: {
  background: string;
  fontFamily: string;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0" style={{ containerType: "size", background, fontFamily }}>
      {children}
    </div>
  );
}

/** Browser twin of renderScreenshots in src/render.ts; keep the numbers in step with it. */
function ScreenshotScene({
  spec,
  theme,
  background,
  frameUrl,
  headline,
  subhead,
  headlineColor,
  subheadColor,
  captureUrl,
}: {
  spec: { width: number; height: number };
  theme: Theme;
  background: string;
  frameUrl: string;
  headline: string;
  subhead: string | undefined;
  headlineColor: string;
  subheadColor: string;
  captureUrl: string;
}) {
  const g = geometry(spec, theme);
  return (
    <Canvas background={background} fontFamily={theme.fontFamily}>
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto",
          height: g.copyHeight,
          padding: "5.5cqh 9cqw 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: "1.4cqh",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            color: headlineColor,
            fontSize: "8.2cqw",
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: "-0.16cqw",
          }}
        >
          {headline}
        </h1>
        {subhead ? (
          <p
            style={{
              margin: 0,
              color: subheadColor,
              fontSize: "3.8cqw",
              lineHeight: 1.3,
              fontWeight: 400,
            }}
          >
            {subhead}
          </p>
        ) : null}
      </div>

      {/* Screen first, bezel on top: the bezel's cutout is transparent. */}
      <img
        src={`/${captureUrl}`}
        alt=""
        draggable={false}
        style={{ position: "absolute", ...g.screen, objectFit: "cover" }}
      />
      <img
        src={`/${frameUrl}`}
        alt=""
        draggable={false}
        style={{ position: "absolute", ...g.frame }}
      />
    </Canvas>
  );
}

/**
 * Plays the raw clips back to back, unframed, exactly as the exported video
 * joins them. Always muted - the configured audio bed only exists in the
 * exported video.
 */
function PreviewScene({ segments }: { segments: Array<{ url: string; durationSeconds: number }> }) {
  const [index, setIndex] = useState(0);
  const segment = segments[index % segments.length]!;
  return (
    // Remounting on every advance restarts playback even with one clip.
    <video
      key={index}
      src={`/${segment.url}`}
      autoPlay
      muted
      playsInline
      preload="auto"
      onEnded={() => setIndex((i) => i + 1)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

function Tile({
  width,
  height,
  caption,
  bad,
  badReason,
  children,
}: {
  width: number;
  height: number;
  caption: string;
  bad: boolean;
  badReason?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl bg-neutral-200 shadow-sm ring-1 ring-black/10 dark:bg-neutral-800 dark:ring-white/10"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {children}
      </div>
      <p
        title={bad ? badReason : undefined}
        className={`pt-2 text-center text-[11px] tabular-nums ${
          bad ? "font-medium text-red-500" : "text-neutral-400 dark:text-neutral-500"
        }`}
      >
        {caption}
      </p>
    </div>
  );
}

/**
 * Mirror of the CLI's isDarkBackground: mean relative luminance of the
 * background's hex stops, below 0.5 counts as dark.
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
