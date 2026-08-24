import { useEffect, useRef, useState } from "react";
import type { DeviceEntry, LocaleAssets } from "../manifest";

/**
 * The five-up strip: the app preview video followed by the framed
 * screenshots, each tile exactly the finished file. While the video is being
 * re-rendered its tile shows a pulsing skeleton at the same aspect ratio, so
 * the strip does not jump when the new file lands.
 *
 * Each tile carries its own caption with the file's dimensions; it turns red
 * when the file does not match the size Apple requires for the device, so the
 * warning sits next to the asset it is about.
 */
export function Strip({
  assets,
  spec,
  videoPending,
}: {
  assets: LocaleAssets;
  spec: DeviceEntry | undefined;
  videoPending: boolean;
}) {
  const count = assets.screenshots.length + (assets.preview ? 1 : 0);
  if (count === 0) return null;

  return (
    <div
      className="grid w-full items-start gap-4"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {assets.preview ? (
        <Tile
          width={assets.preview.width}
          height={assets.preview.height}
          caption={`${assets.preview.width}×${assets.preview.height} · ${assets.preview.durationSeconds.toFixed(1)}s`}
          bad={
            spec
              ? assets.preview.width !== spec.preview.width ||
                assets.preview.height !== spec.preview.height ||
                assets.preview.durationSeconds < 15 ||
                assets.preview.durationSeconds > 30
              : false
          }
        >
          {videoPending ? <Skeleton /> : <Video url={assets.preview.url} />}
        </Tile>
      ) : null}
      {assets.screenshots.map((shot) => (
        <Tile
          key={shot.url}
          width={shot.width}
          height={shot.height}
          caption={`${shot.width}×${shot.height}`}
          bad={
            spec
              ? shot.width !== spec.screenshot.width || shot.height !== spec.screenshot.height
              : false
          }
        >
          <img
            src={`/${shot.url}`}
            alt={shot.sceneId}
            className="h-full w-full object-cover"
            draggable={false}
          />
        </Tile>
      ))}
    </div>
  );
}

function Tile({
  width,
  height,
  caption,
  bad,
  children,
}: {
  width: number;
  height: number;
  caption: string;
  bad: boolean;
  children: React.ReactNode;
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
        title={bad ? "Does not match the size Apple requires for this device." : undefined}
        className={`pt-2 text-center text-[11px] tabular-nums ${
          bad ? "font-medium text-red-500" : "text-neutral-400 dark:text-neutral-500"
        }`}
      >
        {caption}
      </p>
    </div>
  );
}

function Video({ url }: { url: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  // A new cache-busted url after a regenerate needs an explicit reload.
  useEffect(() => {
    video.current?.load();
    void video.current?.play().catch(() => {});
  }, [url]);

  return (
    <>
      <video
        ref={video}
        src={`/${url}`}
        className="h-full w-full object-cover"
        muted={muted}
        loop
        playsInline
        autoPlay
        preload="metadata"
      />
      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        <SpeakerIcon muted={muted} />
      </button>
    </>
  );
}

function Skeleton() {
  return (
    <div className="absolute inset-0 grid animate-pulse place-items-center bg-neutral-300 dark:bg-neutral-700">
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8 text-neutral-400 dark:text-neutral-500"
        fill="currentColor"
      >
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h3l4-3.5v13L7 15H4z" fill="currentColor" stroke="none" />
      {muted ? (
        <path d="M15.5 9.5l4 5M19.5 9.5l-4 5" />
      ) : (
        <>
          <path d="M15.5 9a4 4 0 0 1 0 6" />
          <path d="M18 7a7 7 0 0 1 0 10" />
        </>
      )}
    </svg>
  );
}
