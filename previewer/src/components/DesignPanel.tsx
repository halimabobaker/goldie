import { useState } from "react";
import type { Design } from "../manifest";
import { Field, Select } from "./Sidebar";

/**
 * The design controls: pick a background and a bezel variant. Both are plain
 * React state owned by the App - the strip composites them in the browser, so
 * every change repaints instantly. Nothing runs until Export; copy values you
 * like into gilded.config.ts to keep them.
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

export function DesignPanel({
  design,
  background,
  frame,
  onBackground,
  onFrame,
}: {
  design: Design;
  background: string;
  frame: string;
  onBackground: (v: string) => void;
  onFrame: (v: string) => void;
}) {
  const initialHexes = background.match(/#[0-9a-fA-F]{6}/g) ?? [];

  const [mode, setMode] = useState<Mode>("presets");
  const [from, setFrom] = useState(initialHexes[0] ?? "#E8F1FF");
  const [to, setTo] = useState(initialHexes[initialHexes.length - 1] ?? "#FFFFFF");
  const [angle, setAngle] = useState(Number(background.match(/(\d+)deg/)?.[1] ?? 160));

  // Equal colors render as a solid, so "custom" covers solids too.
  const applyGradient = (f: string, t: string, a: number) => {
    setFrom(f);
    setTo(t);
    setAngle(a);
    onBackground(f === t ? f : `linear-gradient(${a}deg, ${f} 0%, ${t} 100%)`);
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
                  onClick={() => onBackground(preset.css)}
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

      {design.frameVariants.length > 1 || design.frameVariant === null ? (
        <Field label="Device frame">
          <Select
            value={frame}
            onChange={onFrame}
            options={[
              ...design.frameVariants.map((v): [string, string] => [v, FRAME_LABELS[v] ?? v]),
              ...(design.frameVariant === null ? [["", "custom (from config)"] as [string, string]] : []),
            ]}
          />
        </Field>
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
