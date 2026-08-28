import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type React from "react";
import { type ReactNode, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { layout } from "../../../src/frame";
import type { Design, DeviceCaptures, DeviceEntry, SceneCopy, Theme } from "../manifest";
import { Button } from "./ui/button";

/** Tiles shown at once; the App Store product page shows this many before scrolling. */
const PAGE_SIZE = 5;
/** Apple's cap on screenshots per device family. */
const MAX_SCREENSHOTS = 10;

/**
 * The five-up strip, composited in the browser: each screenshot tile is the
 * raw device capture inside the bezel art on the chosen background, laid out
 * with the exact geometry the CLI renders with (src/frame.ts), so what you see
 * is what an export renders. Background and frame arrive as props from React
 * state - changing them repaints instantly, no CLI involved. The preview tile
 * plays the raw clips as they are: Apple requires a plain screen recording.
 *
 * The App Store allows up to ten screenshots; the strip shows five tiles at a
 * time, and when there are more, arrows page through them like the store's
 * own carousel. Scenes past the tenth are dropped with a note.
 *
 * Every tile is a size-container: the geometry is computed in the device's
 * spec pixels and expressed in cqw/cqh, so the tile is the composition scaled
 * down. Captions under the tiles show the spec size the export will produce;
 * the video's turns red when the clips sum outside Apple's 15-30s window.
 *
 * In the lightbox the headline and subhead are editable in place; a change
 * is reported through onCopy for the current locale and layered over the
 * config's copy here and in the CLI, via goldie.design.json.
 */
export function Strip({
  design,
  captures,
  spec,
  locale,
  background,
  frameUrl,
  fontFamily,
  copy,
  onCopy,
}: {
  design: Design;
  captures: DeviceCaptures;
  spec: DeviceEntry;
  locale: string;
  background: string;
  frameUrl: string;
  fontFamily: string;
  copy: Record<string, SceneCopy>;
  onCopy: (sceneId: string, field: "headline" | "subhead", text: string) => void;
}) {
  const theme = design.theme;

  // Mirrors the CLI's --background handling: a dark background flips the copy
  // to light, and per-scene background overrides are dropped, so the export
  // matches what is on screen.
  const dark = isDarkBackground(background);
  const headlineColor = dark ? "#FFFFFF" : theme.headlineColor;
  const subheadColor = dark ? "#D9E1EA" : theme.subheadColor;

  const allShots = design.scenes.flatMap((scene) => {
    const capture = captures.screenshots.find((s) => s.sceneId === scene.id);
    return capture ? [{ scene, capture }] : [];
  });
  const shots = allShots.slice(0, MAX_SCREENSHOTS);
  const dropped = allShots.length - shots.length;

  const segments =
    design.preview && captures.clips
      ? design.preview.segments.flatMap((seg) => {
          const clip = captures.clips!.find((c) => c.segmentId === seg.id);
          return clip ? [{ url: clip.url, durationSeconds: clip.durationSeconds }] : [];
        })
      : [];

  const totalSeconds = segments.reduce((s, c) => s + c.durationSeconds, 0);

  type Entry = {
    key: string;
    width: number;
    height: number;
    caption: string;
    bad: boolean;
    badReason?: string;
    /** Whether the lightbox offers in-place copy editing (screenshots only). */
    editable: boolean;
    /** The composition; editable renders the copy as editable text (lightbox only). */
    scene: (editable: boolean) => ReactNode;
  };
  const entries: Entry[] = [];
  if (segments.length > 0) {
    entries.push({
      key: "preview",
      width: spec.preview.width,
      height: spec.preview.height,
      caption: `${spec.preview.width}×${spec.preview.height} · ${totalSeconds.toFixed(1)}s`,
      bad: totalSeconds < 15 || totalSeconds > 30,
      badReason: "Clips sum outside the 15-30s Apple allows for previews.",
      editable: false,
      scene: () => <PreviewScene segments={segments} />,
    });
  }
  for (const { scene, capture } of shots) {
    entries.push({
      key: scene.id,
      width: spec.screenshot.width,
      height: spec.screenshot.height,
      caption: `${spec.screenshot.width}×${spec.screenshot.height}`,
      bad: false,
      editable: true,
      scene: (editable) => (
        <ScreenshotScene
          spec={spec.screenshot}
          theme={theme}
          background={background}
          frameUrl={frameUrl}
          fontFamily={fontFamily}
          headline={copy[scene.id]?.headline?.[locale] ?? scene.headline[locale] ?? ""}
          subhead={copy[scene.id]?.subhead?.[locale] ?? scene.subhead?.[locale]}
          headlineColor={headlineColor}
          subheadColor={subheadColor}
          captureUrl={capture.url}
          onEdit={editable ? (field, text) => onCopy(scene.id, field, text) : undefined}
        />
      ),
    });
  }

  const [open, setOpenState] = useState<number | null>(null);
  // The tile that shares its view-transition-name with the lightbox scene.
  // It must already be named in the frame *before* the transition starts,
  // or the old snapshot has nothing to morph from; so it is committed
  // synchronously first, and only cleared once the closing morph is done.
  const [named, setNamed] = useState<number | null>(null);
  const setOpen = (next: number | null) => {
    if (typeof document.startViewTransition !== "function") {
      setNamed(next);
      setOpenState(next);
      return;
    }
    if (next !== null) flushSync(() => setNamed(next));
    const transition = document.startViewTransition(() => flushSync(() => setOpenState(next)));
    if (next === null) transition.finished.finally(() => setNamed(null));
  };
  const tiles = entries.map((entry, i) => (
    <Tile
      key={entry.key}
      width={entry.width}
      height={entry.height}
      caption={entry.caption}
      bad={entry.bad}
      badReason={entry.badReason}
      onOpen={() => setOpen(i)}
      // Named only while the lightbox is closed: once open, the scene inside
      // it carries the name, and a duplicate would abort the transition.
      transitionName={named === i && open === null ? "lightbox-scene" : undefined}
    >
      {entry.scene(false)}
    </Tile>
  ));

  const pages = Math.max(1, Math.ceil(tiles.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  // A device switch can shrink the tile count; keep the page in range.
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);
  useEffect(() => {
    if (open !== null && open > entries.length - 1) {
      setOpenState(null);
      setNamed(null);
    }
  }, [open, entries.length]);

  if (tiles.length === 0) return null;

  const visible = tiles.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  // Pad the last page so tiles keep the same width as on a full page.
  const columns = pages > 1 ? PAGE_SIZE : tiles.length;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="relative">
        <div
          className="grid w-full items-start gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {visible}
        </div>

        {pages > 1 ? (
          <>
            <PagerButton
              side="left"
              label="Previous screenshots"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            />
            <PagerButton
              side="right"
              label="Next screenshots"
              disabled={page === pages - 1}
              onClick={() => setPage((p) => p + 1)}
            />
          </>
        ) : null}
      </div>

      {pages > 1 || dropped > 0 ? (
        <div className="flex items-center justify-center gap-3 text-[11px] text-neutral-400 dark:text-neutral-500">
          {pages > 1 ? (
            <span className="tabular-nums">
              {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + visible.length} of {tiles.length}
            </span>
          ) : null}
          {dropped > 0 ? (
            <span className="font-medium text-red-500">
              {dropped} more scene{dropped === 1 ? "" : "s"} hidden: the App Store allows{" "}
              {MAX_SCREENSHOTS} screenshots.
            </span>
          ) : null}
        </div>
      ) : null}

      {open !== null && entries[open] ? (
        <Lightbox
          entry={entries[open]}
          index={open}
          count={entries.length}
          onClose={() => setOpen(null)}
          // Stepping swaps the scene in place with no morph.
          onStep={(delta) => {
            if (open === null) return;
            const next = Math.min(entries.length - 1, Math.max(0, open + delta));
            setNamed(next);
            setOpenState(next);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Full-viewport view of one tile: the same composition, rendered as large as
 * the window allows at the spec's aspect ratio. Click outside, Escape, or the
 * close button dismiss it; arrow keys step between tiles. Keys typed into the
 * editable copy are left to the text.
 */
function Lightbox({
  entry,
  index,
  count,
  onClose,
  onStep,
}: {
  entry: {
    width: number;
    height: number;
    caption: string;
    editable: boolean;
    scene: (editable: boolean) => ReactNode;
  };
  index: number;
  count: number;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onStep(-1);
      else if (e.key === "ArrowRight") onStep(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot preview"
      className="animate-in fade-in fixed inset-0 z-50 flex duration-150 flex-col items-center justify-center gap-3 bg-black/80 p-8 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
        style={{
          viewTransitionName: "lightbox-scene",
          aspectRatio: `${entry.width} / ${entry.height}`,
          maxWidth: "calc(100vw - 4rem)",
          maxHeight: "calc(100vh - 6rem)",
          width: `calc((100vh - 6rem) * ${entry.width / entry.height})`,
        }}
      >
        {entry.scene(true)}
      </div>
      <p className="text-[11px] text-neutral-300 tabular-nums">
        {count > 1 ? `${index + 1} of ${count} · ` : ""}
        {entry.caption}
        {entry.editable ? " · click the text to edit it" : ""}
      </p>

      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label="Close"
        className="absolute top-4 right-4 rounded-full"
        onClick={onClose}
      >
        <X />
      </Button>
      {count > 1 ? (
        <>
          <PagerButton
            side="left"
            label="Previous"
            disabled={index === 0}
            onClick={() => onStep(-1)}
            inset
          />
          <PagerButton
            side="right"
            label="Next"
            disabled={index === count - 1}
            onClick={() => onStep(1)}
            inset
          />
        </>
      ) : null}
    </div>
  );
}

/** Round arrow floating over the strip's edge, like the store carousel's. */
function PagerButton({
  side,
  label,
  disabled,
  onClick,
  inset = false,
}: {
  side: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
  /** Sit inside the edge instead of overhanging it (used in the lightbox). */
  inset?: boolean;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  const offset = inset
    ? side === "left"
      ? "left-4"
      : "right-4"
    : side === "left"
      ? "-left-5"
      : "-right-5";
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-lg"
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full shadow-md ${offset}`}
    >
      <Icon />
    </Button>
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

/**
 * Browser twin of renderScreenshots in src/render.ts; keep the numbers in step
 * with it. With onEdit set, the headline and subhead are contentEditable and
 * report their text when editing ends (blur, or Enter).
 */
function ScreenshotScene({
  spec,
  theme,
  background,
  frameUrl,
  fontFamily,
  headline,
  subhead,
  headlineColor,
  subheadColor,
  captureUrl,
  onEdit,
}: {
  spec: { width: number; height: number };
  theme: Theme;
  background: string;
  frameUrl: string;
  fontFamily: string;
  headline: string;
  subhead: string | undefined;
  headlineColor: string;
  subheadColor: string;
  captureUrl: string;
  onEdit?: (field: "headline" | "subhead", text: string) => void;
}) {
  const g = geometry(spec, theme);
  const editable = onEdit ? editableProps : () => ({});
  return (
    <Canvas background={background} fontFamily={fontFamily}>
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
          {...editable((text) => onEdit?.("headline", text), headline, "Headline")}
        >
          {headline}
        </h1>
        {subhead || onEdit ? (
          <p
            style={{
              margin: 0,
              color: subheadColor,
              fontSize: "3.8cqw",
              lineHeight: 1.3,
              fontWeight: 400,
              minWidth: "30cqw",
            }}
            {...editable((text) => onEdit?.("subhead", text), subhead ?? "", "Subhead")}
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
 * Props that make a copy element editable in place. The text is committed
 * on blur or Enter (Shift+Enter keeps a line break, as the export honours
 * newlines); Escape restores the current value and leaves the field.
 */
function editableProps(commit: (text: string) => void, current: string, label: string) {
  return {
    contentEditable: "plaintext-only" as const,
    suppressContentEditableWarning: true,
    role: "textbox",
    "aria-label": label,
    "data-placeholder": label,
    spellCheck: false,
    className: "editable-copy",
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      const text = e.currentTarget.innerText.replace(/\n+$/, "");
      if (text !== current) commit(text);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.currentTarget.innerText = current;
        e.currentTarget.blur();
      }
    },
  };
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
  onOpen,
  transitionName,
  children,
}: {
  width: number;
  height: number;
  caption: string;
  bad: boolean;
  badReason?: string;
  onOpen: () => void;
  transitionName?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        aria-label="Open full-size preview"
        onClick={onOpen}
        className="relative block w-full cursor-zoom-in overflow-hidden rounded-2xl bg-neutral-200 shadow-sm ring-1 ring-black/10 transition select-none hover:ring-black/30 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:bg-neutral-800 dark:ring-white/10 dark:hover:ring-white/30"
        style={{ aspectRatio: `${width} / ${height}`, viewTransitionName: transitionName }}
      >
        {children}
      </button>
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
