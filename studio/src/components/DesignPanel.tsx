import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Design, LayoutEntry } from "../manifest";
import { FontPicker } from "./FontPicker";
import { Field, Select } from "./Sidebar";
import { TemplatePicker } from "./TemplatePicker";

/**
 * The design controls: pick a background, a layout, a bezel variant (or no
 * bezel) and a font. All are plain
 * React state owned by the App - the strip composites them in the browser, so
 * every change repaints instantly. Nothing runs until Export; copy values you
 * like into goldie.config.ts to keep them.
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

/** The studio's "System" font choice; mirrors SYSTEM_FONT in src/fonts.ts. */
const SYSTEM_FONT = '-apple-system, "SF Pro Display", system-ui, sans-serif';

export function DesignPanel({
  design,
  background,
  frame,
  fontFamily,
  template,
  layout,
  screenOnly,
  onBackground,
  onFrame,
  onFontFamily,
  onTemplate,
  onLayout,
  onScreenOnly,
}: {
  design: Design;
  background: string;
  frame: string;
  fontFamily: string;
  template: string;
  layout: string;
  screenOnly: boolean;
  onBackground: (v: string) => void;
  onFrame: (v: string) => void;
  onFontFamily: (v: string) => void;
  onTemplate: (v: string) => void;
  onLayout: (v: string) => void;
  onScreenOnly: (v: boolean) => void;
}) {
  // Each choice is a full CSS font stack, so the Strip can use it as-is. A
  // config stack that matches none of them shows as "custom (from config)".
  const fontOptions: Array<[string, string]> = [
    [SYSTEM_FONT, "System (SF Pro)"],
    ...design.fonts.map((f): [string, string] => [`"${f.family}", ${f.fallback}`, f.family]),
  ];
  if (!fontOptions.some(([css]) => css === fontFamily)) {
    fontOptions.push([fontFamily, "custom (from config)"]);
  }

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
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="w-full">
            <TabsTrigger value="presets" className="flex-1">
              Presets
            </TabsTrigger>
            <TabsTrigger value="custom" className="flex-1">
              Custom
            </TabsTrigger>
          </TabsList>

          <TabsContent value="presets" className="pt-2">
            <div className="grid grid-cols-8 gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.name}
                  title={preset.name}
                  aria-label={preset.name}
                  onClick={() => onBackground(preset.css)}
                  style={{ background: preset.css }}
                  className={`aspect-square rounded-md ring-1 ${
                    background === preset.css
                      ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                      : "ring-border"
                  }`}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="pt-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <ColorInput
                  label="From"
                  value={from}
                  onChange={(c) => applyGradient(c, to, angle)}
                />
                <ColorInput label="To" value={to} onChange={(c) => applyGradient(from, c, angle)} />
              </div>
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className="w-12 shrink-0">{angle}°</span>
                <Slider
                  aria-label="Gradient angle"
                  min={0}
                  max={360}
                  value={[angle]}
                  onValueChange={([a]) => applyGradient(from, to, a ?? angle)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </Field>

      <Field label="Template">
        <TemplatePicker design={design} value={template} layout={layout} onChange={onTemplate} />
      </Field>

      {template === "" ? (
        <Field label="Layout">
          <Select value={layout} onChange={onLayout} options={layoutOptions(design.layouts)} />
          <p className="text-[11px] leading-snug text-muted-foreground">
            {design.layouts.find((l) => l.key === layout)?.description ?? ""}
          </p>
        </Field>
      ) : null}

      <Field label="Device">
        <Tabs
          value={screenOnly ? "screen" : "bezel"}
          onValueChange={(v) => onScreenOnly(v === "screen")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="bezel" className="flex-1">
              Bezel
            </TabsTrigger>
            <TabsTrigger value="screen" className="flex-1">
              Screen only
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {!screenOnly && (design.frameVariants.length > 1 || design.frameVariant === null) ? (
          <Select
            value={frame}
            onChange={onFrame}
            options={[
              ...design.frameVariants.map((v): [string, string] => [v, FRAME_LABELS[v] ?? v]),
              ...(design.frameVariant === null
                ? [["", "custom (from config)"] as [string, string]]
                : []),
            ]}
          />
        ) : null}
      </Field>

      <Field label="Font">
        <FontPicker value={fontFamily} onChange={onFontFamily} options={fontOptions} />
      </Field>
    </div>
  );
}

/** Select options for the layouts; a two-tile layout says so. */
export function layoutOptions(layouts: LayoutEntry[]): Array<[string, string]> {
  return layouts.map((l) => [l.key, l.span > 1 ? `${l.label} · 2 tiles` : l.label]);
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
    <label className="flex flex-1 items-center gap-2 text-[12px] text-muted-foreground">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
      />
      <span>
        {label}
        <br />
        <code className="text-[11px] uppercase">{value}</code>
      </span>
    </label>
  );
}
