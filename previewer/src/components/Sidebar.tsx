import { MoonIcon, SunIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  SelectContent,
  SelectItem,
  Select as SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { StoreManifest } from "../manifest";
import { DesignPanel } from "./DesignPanel";
import { ExportPanel } from "./ExportPanel";

export function Sidebar({
  manifest,
  device,
  locale,
  dark,
  background,
  frame,
  onDevice,
  onLocale,
  onDark,
  onBackground,
  onFrame,
}: {
  manifest: StoreManifest;
  device: string;
  locale: string;
  dark: boolean;
  background: string;
  frame: string;
  onDevice: (v: string) => void;
  onLocale: (v: string) => void;
  onDark: (v: boolean) => void;
  onBackground: (v: string) => void;
  onFrame: (v: string) => void;
}) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col gap-6 overflow-y-auto border-r bg-sidebar p-6 text-sidebar-foreground">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold">
          <span aria-hidden="true">✨ </span>
          <span className="goldie-wordmark">goldie</span>
        </h1>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDark(!dark)}
          aria-label={dark ? "Switch to light appearance" : "Switch to dark appearance"}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>

      <DesignPanel
        design={manifest.design}
        background={background}
        frame={frame}
        onBackground={onBackground}
        onFrame={onFrame}
      />

      {manifest.devices.length > 1 ? (
        <Field label="Device">
          <Select
            value={device}
            onChange={onDevice}
            options={manifest.devices.map((d) => [d.key, `${d.label}"`])}
          />
        </Field>
      ) : null}

      {manifest.locales.length > 1 ? (
        <Field label="Locale">
          <Select
            value={locale}
            onChange={onLocale}
            options={manifest.locales.map((l) => [l, l])}
          />
        </Field>
      ) : null}

      <div className="mt-auto flex flex-col gap-4">
        <Separator />
        <ExportPanel background={background} frame={frame} />
      </div>
    </aside>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * Radix Select treats "" as "no value", so the custom-frame option (an empty
 * slug) rides on a sentinel that is mapped back on change.
 */
const EMPTY = "__none__";

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <SelectRoot value={value || EMPTY} onValueChange={(v) => onChange(v === EMPTY ? "" : v)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v || EMPTY}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}
