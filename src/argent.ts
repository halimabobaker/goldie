import { exec, execOrThrow, parseJsonTail } from "./exec.ts";

/**
 * argent has no importable JS API - `@swmansion/argent` publishes only `bin`.
 * Everything here shells out to the CLI, which is the supported surface.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Prefer the pinned devDependency over whatever happens to be on PATH. */
function resolveBin(): string {
  if (process.env.GILDED_ARGENT_BIN) return process.env.GILDED_ARGENT_BIN;
  const local = resolve(import.meta.dirname, "..", "node_modules", ".bin", "argent");
  return existsSync(local) ? local : "argent";
}

const BIN = resolveBin();

type Primitive = string | number | boolean;

function flags(args: Record<string, Primitive | undefined>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined) continue;
    out.push(`--${k}`, String(v));
  }
  return out;
}

/** Invoke a tool and return its parsed `data`. */
export async function run<T = any>(tool: string, args: Record<string, Primitive | undefined>): Promise<T> {
  const r = await execOrThrow(BIN, ["run", tool, "--json", ...flags(args)]);
  const parsed = parseJsonTail<any>(r.stdout);
  return (parsed?.data ?? parsed) as T;
}

/** Invoke a tool that returns an image/video artifact, writing it to `out`. */
export async function runToFile(tool: string, args: Record<string, Primitive | undefined>, out: string): Promise<string> {
  await execOrThrow(BIN, ["run", tool, "--out", out, ...flags(args)]);
  return out;
}

/** Mirrors argent's StepReport (packages/tool-server/src/tools/flows/flow-run.ts). */
export type FlowStepReport = {
  index?: number;
  kind?: string;
  status?: string;
  /** Machine-readable explanation; always set when the step did not pass. */
  reason?: string;
  warning?: string;
  tool?: string;
  /** Display-only "what this step acts on" - the selector, the snapshot name. */
  target?: string;
  message?: string;
  error?: string;
  [k: string]: unknown;
};

export type FlowReport = {
  ok: boolean;
  raw: unknown;
  steps: FlowStepReport[];
  failed: FlowStepReport | null;
  stdout: string;
};

/** Replay a flow YAML headlessly. Never throws - inspect `ok` / `failed`. */
export async function flow(pathOrName: string, udid: string): Promise<FlowReport> {
  const r = await exec(BIN, ["flow", "run", pathOrName, "--device", udid, "--json"], { quiet: true });
  const raw = parseJsonTail<any>(r.stdout);
  const steps: FlowStepReport[] = raw?.steps ?? raw?.report?.steps ?? [];
  const failed = steps.find((s) => s.status === "fail" || s.status === "error") ?? null;
  return { ok: r.code === 0, raw, steps, failed, stdout: r.stdout + r.stderr };
}


/** Is the argent corner watermark disabled? Previews must not carry it. */
export async function watermarkDisabled(): Promise<boolean> {
  const r = await exec(BIN, ["flags"], { quiet: true });
  const line = r.stdout.split("\n").find((l) => l.includes("video-watermark"));
  return Boolean(line && /disabled/.test(line));
}

/**
 * Stop the shared tool-server so the next call auto-spawns a fresh one.
 * Needed after a simulator shutdown: the running server keeps a transport
 * session pointed at the device that went away, and every later `launch`
 * then fails its native-devtools handshake.
 */
export async function restartServer(): Promise<void> {
  await exec(BIN, ["server", "stop"], { quiet: true });
  await new Promise((r) => setTimeout(r, 1500));
}

export async function available(): Promise<boolean> {
  const r = await exec(BIN, ["--version"], { quiet: true });
  return r.code === 0;
}
