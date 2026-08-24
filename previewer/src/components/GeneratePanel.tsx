import { useEffect, useRef, useState } from "react";
import type { StoreManifest } from "../manifest";
import { Field, Select } from "./Sidebar";

/**
 * The controls that make the previewer an active tool: pick a background and
 * a bezel variant and the dev server re-renders the assets from the existing
 * raw captures (dev server only - a static build has no /api/regenerate).
 * Regeneration is automatic: any change is debounced and sent; edits made
 * while a run is in flight are queued and applied right after. The config
 * file is not touched; copy values you like into gilded.config.ts.
 */

const PRESETS: Array<{ name: string; css: string }> = [
  { name: "Arctic", css: "linear-gradient(160deg, #E8F1FF 0%, #F7FAFF 55%, #FFFFFF 100%)" },
  { name: "Peach", css: "linear-gradient(160deg, #FFE8D6 0%, #FFF7F0 55%, #FFFFFF 100%)" },
  { name: "Mint", css: "linear-gradient(160deg, #D9F9EF 0%, #F2FDF9 55%, #FFFFFF 100%)" },
  { name: "Lavender", css: "linear-gradient(160deg, #E9E4FF 0%, #F7F5FF 55%, #FFFFFF 100%)" },
  { name: "Sand", css: "linear-gradient(160deg, #F7ECDD 0%, #FCF7F0 55%, #FFFFFF 100%)" },
  { name: "Blush", css: "linear-gradient(160deg, #FFE0E9 0%, #FFF5F8 55%, #FFFFFF 100%)" },
  { name: "Lemon", css: "linear-gradient(160deg, #FFF3C4 0%, #FFFBEB 55%, #FFFFFF 100%)" },
  { name: "Silver", css: "linear-gradient(160deg, #E2E8F0 0%, #F1F5F9 55%, #FFFFFF 100%)" },
  { name: "Ocean", css: "linear-gradient(160deg, #0EA5E9 0%, #2563EB 100%)" },
  { name: "Ember", css: "linear-gradient(160deg, #F97316 0%, #DC2626 100%)" },
  { name: "Forest", css: "linear-gradient(160deg, #059669 0%, #065F46 100%)" },
  { name: "Midnight", css: "linear-gradient(160deg, #1E293B 0%, #0F172A 100%)" },
  { name: "Grape", css: "linear-gradient(160deg, #8B5CF6 0%, #4C1D95 100%)" },
  { name: "Berry", css: "linear-gradient(160deg, #EC4899 0%, #831843 100%)" },
  { name: "Aurora", css: "linear-gradient(160deg, #0D9488 0%, #1E3A8A 100%)" },
  { name: "Graphite", css: "linear-gradient(160deg, #3F3F46 0%, #18181B 100%)" },
];

type Mode = "presets" | "custom";

/** Display names for the bundled bezel variants; unknown slugs fall back to the slug. */
const FRAME_LABELS: Record<string, string> = {
  "17-pro-silver": "iPhone 17 Pro Silver",
  "17-pro-blue": "iPhone 17 Pro Deep Blue",
  "17-pro-orange": "iPhone 17 Pro Cosmic Orange",
};

type Payload = { background: string; frame: string; video: boolean };
type Applied = { background: string; frame: string };

export function GeneratePanel({
  manifest,
  onRegenerated,
  onVideoPending,
}: {
  manifest: StoreManifest;
  onRegenerated: () => void;
  onVideoPending: (pending: boolean) => void;
}) {
  const gen = manifest.generation;
  const initialBackground = gen?.background ?? "";
  const initialHexes = initialBackground.match(/#[0-9a-fA-F]{6}/g) ?? [];

  const [background, setBackground] = useState(initialBackground);
  const [frame, setFrame] = useState(gen?.frameVariant ?? gen?.frameVariants[0] ?? "");
  const [video, setVideo] = useState(false);
  const [mode, setMode] = useState<Mode>("presets");

  const [from, setFrom] = useState(initialHexes[0] ?? "#E8F1FF");
  const [to, setTo] = useState(initialHexes[initialHexes.length - 1] ?? "#FFFFFF");
  const [angle, setAngle] = useState(Number(initialBackground.match(/(\d+)deg/)?.[1] ?? 160));

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  // What the assets on disk were last rendered with, tracked separately for
  // stills and video: turning "Include video" on after a few changes still
  // notices the video is behind and re-renders it.
  const applied = useRef<{ stills: Applied; video: Applied }>({
    stills: { background: initialBackground, frame: gen?.frameVariant ?? "" },
    video: { background: initialBackground, frame: gen?.frameVariant ?? "" },
  });
  const running = useRef(false);
  const queued = useRef<Payload | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  useEffect(() => {
    if (!gen) return;
    const stale = (a: Applied) => background !== a.background || frame !== a.frame;
    const needStills = stale(applied.current.stills);
    const needVideo = video && stale(applied.current.video);
    if (!needStills && !needVideo) return;
    const timer = setTimeout(() => void request({ background, frame, video: needVideo }), 800);
    return () => clearTimeout(timer);
  }, [background, frame, video]);

  if (!gen) return null;

  async function request(payload: Payload) {
    if (running.current) {
      queued.current = payload;
      return;
    }
    running.current = true;
    setBusy(true);
    if (payload.video) onVideoPending(true);
    setLog("");
    let text = "";
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        setLog(`${res.status}: ${await res.text()}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setLog(text);
      }
      if (text.includes("[done]")) {
        applied.current.stills = { background: payload.background, frame: payload.frame };
        if (payload.video) applied.current.video = { background: payload.background, frame: payload.frame };
        setLog(null);
        onRegenerated();
      }
    } catch (err) {
      setLog(`${text}\n${err instanceof Error ? err.message : err}`);
    } finally {
      running.current = false;
      setBusy(false);
      const next = queued.current;
      queued.current = null;
      if (next) {
        void request(next);
      } else {
        onVideoPending(false);
      }
    }
  }

  // Equal colors render as a solid, so "custom" covers solids too.
  const applyGradient = (f: string, t: string, a: number) => {
    setFrom(f);
    setTo(t);
    setAngle(a);
    setBackground(f === t ? f : `linear-gradient(${a}deg, ${f} 0%, ${t} 100%)`);
  };

  return (
    <div className="flex flex-col gap-5">
      <Field label="Background">
        <div className="flex rounded-lg bg-black/[0.06] p-0.5 dark:bg-white/10">
          {(
            [
              ["presets", "Presets"],
              ["custom", "Custom"],
            ] as Array<[Mode, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`flex-1 rounded-[6px] px-1 py-1 text-[12px] ${
                mode === value
                  ? "bg-white shadow-sm dark:bg-neutral-700"
                  : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="pt-3">
          {mode === "presets" ? (
            <div className="grid grid-cols-8 gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  title={preset.name}
                  onClick={() => setBackground(preset.css)}
                  style={{ background: preset.css }}
                  className={`aspect-square rounded-md ring-1 ${
                    background === preset.css
                      ? "ring-2 ring-store-blue ring-offset-1 ring-offset-white dark:ring-offset-neutral-950"
                      : "ring-black/10 dark:ring-white/15"
                  }`}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ColorInput label="From" value={from} onChange={(c) => applyGradient(c, to, angle)} />
                <ColorInput label="To" value={to} onChange={(c) => applyGradient(from, c, angle)} />
              </div>
              <label className="flex items-center gap-2 text-[12px] text-neutral-500">
                <span className="w-12 shrink-0">{angle}°</span>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={angle}
                  onChange={(e) => applyGradient(from, to, Number(e.target.value))}
                  className="w-full accent-store-blue"
                />
              </label>
            </div>
          )}
        </div>
      </Field>

      {gen.frameVariants.length > 1 || gen.frameVariant === null ? (
        <Field label="Device frame">
          <Select
            value={frame}
            onChange={setFrame}
            options={[
              ...gen.frameVariants.map((v): [string, string] => [v, FRAME_LABELS[v] ?? v]),
              ...(gen.frameVariant === null ? [["", "custom (from config)"] as [string, string]] : []),
            ]}
          />
        </Field>
      ) : null}

      <label className="flex cursor-pointer items-center justify-between text-[13px]">
        <span>Include video</span>
        <input
          type="checkbox"
          checked={video}
          onChange={(e) => setVideo(e.target.checked)}
          className="h-4 w-4 accent-store-blue"
        />
      </label>

      {busy ? (
        <p className="flex items-center gap-2 text-[12px] text-neutral-500">
          <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-store-blue border-t-transparent" />
          Regenerating…
        </p>
      ) : log !== null ? (
        <p className="text-[12px] text-red-500">Regeneration failed.</p>
      ) : null}

      {log !== null ? (
        <pre
          ref={logRef}
          className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/[0.06] p-2 text-[10px] leading-relaxed text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
        >
          {log || "Starting…"}
        </pre>
      ) : null}
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-1 items-center gap-2 text-[12px] text-neutral-500">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-black/10 bg-transparent p-0.5 dark:border-white/15"
      />
      <span>
        {label}
        <br />
        <code className="text-[11px] uppercase">{value}</code>
      </span>
    </label>
  );
}
