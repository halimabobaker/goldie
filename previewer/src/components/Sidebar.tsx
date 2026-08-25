import type { ReactNode } from "react";
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
    <aside className="flex w-[280px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-black/10 bg-white/70 p-6 dark:border-white/10 dark:bg-neutral-950/60">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold">
          <span aria-hidden="true">✨ </span>
          <span className="goldie-wordmark">goldie</span>
        </h1>
        <button
          type="button"
          onClick={() => onDark(!dark)}
          aria-label={dark ? "Switch to light appearance" : "Switch to dark appearance"}
          className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
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

      <div className="mt-auto pt-2">
        <ExportPanel background={background} frame={frame} />
      </div>
    </aside>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      {children}
    </div>
  );
}

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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[13px] dark:border-white/15 dark:bg-neutral-900"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
