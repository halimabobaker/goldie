import { useEffect, useState } from "react";
import { loadManifest, type StoreManifest } from "./manifest";
import { Sidebar } from "./components/Sidebar";
import { Strip } from "./components/Strip";

export function App() {
  const [manifest, setManifest] = useState<StoreManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [device, setDevice] = useState("");
  const [locale, setLocale] = useState("");
  const [dark, setDark] = useState(new URLSearchParams(window.location.search).get("dark") === "1");
  const [videoPending, setVideoPending] = useState(false);

  // Also called after a regenerate; keeps the current device/locale selection.
  const reload = () =>
    loadManifest()
      .then((m) => {
        setManifest(m);
        setDevice((d) => (m.devices.some((x) => x.key === d) ? d : (m.devices[0]?.key ?? "")));
        setLocale((l) => (m.locales.includes(l) ? l : (m.locales[0] ?? "")));
        setError(null);
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  if (error) return <Empty message={error} />;
  if (!manifest) return <Empty message="Loading…" />;

  const assets = manifest.assets[device]?.[locale];
  if (!assets) return <Empty message={`Nothing generated for ${device} / ${locale}.`} />;

  return (
    <div className="flex h-full bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <Sidebar
        manifest={manifest}
        device={device}
        locale={locale}
        dark={dark}
        onDevice={setDevice}
        onLocale={setLocale}
        onDark={setDark}
        onRegenerated={() => void reload()}
        onVideoPending={setVideoPending}
      />

      <main className="grid flex-1 place-items-center overflow-auto p-10">
        <div className="w-full max-w-[1400px]">
          <Strip
            assets={assets}
            spec={manifest.devices.find((d) => d.key === device)}
            videoPending={videoPending}
          />
        </div>
      </main>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center bg-neutral-100 px-10 text-center dark:bg-neutral-900">
      <p className="max-w-md whitespace-pre-line text-[14px] leading-relaxed text-neutral-600 dark:text-neutral-400">
        {message}
      </p>
    </div>
  );
}
