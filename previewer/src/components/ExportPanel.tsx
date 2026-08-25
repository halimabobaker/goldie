import { useEffect, useRef, useState } from "react";

/**
 * The one place the goldie CLI runs: Export re-renders the screenshots and
 * the preview video from the raw captures with the current design, zips them,
 * and hands the browser the zip. Streams the CLI log while it runs (the video
 * render takes a while). Dev server only - a static build has no /api/export.
 */
export function ExportPanel({ background, frame }: { background: string; frame: string }) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  async function exportZip() {
    if (busy) return;
    setBusy(true);
    setLog("");
    let text = "";
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background, frame }),
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
        setLog(null);
        const a = document.createElement("a");
        a.href = "/api/export/download";
        a.download = "";
        a.click();
      }
    } catch (err) {
      setLog(`${text}\n${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {log !== null && !busy ? (
        <p className="text-[12px] text-red-500">Export failed.</p>
      ) : null}

      {log !== null ? (
        <pre
          ref={logRef}
          className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/[0.06] p-2 text-[10px] leading-relaxed text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
        >
          {log || "Starting…"}
        </pre>
      ) : null}

      <button
        onClick={() => void exportZip()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-store-blue py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60 dark:bg-store-blue-dark"
      >
        {busy ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-white border-t-transparent" />
            Exporting…
          </>
        ) : (
          "Export"
        )}
      </button>
    </div>
  );
}
