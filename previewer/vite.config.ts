import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { createReadStream, existsSync, statSync } from "node:fs";
import type { ServerResponse } from "node:http";

const GILDED_ROOT = resolve(import.meta.dirname, "..");
// GILDED_CONFIG points at a config outside this repo; out/ lives next to it.
const OUT_DIR = process.env.GILDED_CONFIG
  ? join(resolve(process.env.GILDED_CONFIG), "..", "out")
  : join(GILDED_ROOT, "out");
const EXPORT_ZIP = join(OUT_DIR, "export.zip");

/**
 * `out/web` is the static root: the manifest, the bezel art and
 * symlinks to the raw captures and finished assets, all served from `/`.
 * Nothing is copied into the previewer, so a re-run of `gilded capture` shows
 * up on reload. Run `gilded manifest` first; the directory does not exist
 * before that. `fs.allow` covers the gilded root because the previewer imports
 * remotion/frame.ts for the shared bezel geometry.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), gildedApi()],
  publicDir: join(OUT_DIR, "web"),
  server: { port: 4321, open: true, fs: { allow: [GILDED_ROOT, OUT_DIR] } },
});

/**
 * POST /api/export - renders the final assets from the raw captures with the
 * chosen background and frame (gilded frame + preview + manifest), zips
 * out/screenshots and out/previews, and streams the CLI log as plain text.
 * Body: { background?: string, frame?: string }.
 * The response ends with "[done]" on success or "[failed]" otherwise; on
 * "[done]" the UI downloads GET /api/export/download. Dev server only; a
 * built dist stays static.
 */
function gildedApi(): Plugin {
  let busy = false;

  return {
    name: "gilded-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/export", (req, res) => {
        if (req.method === "GET" && req.url === "/download") {
          if (!existsSync(EXPORT_ZIP)) {
            res.statusCode = 404;
            res.end("No export yet. POST /api/export first.");
            return;
          }
          res.writeHead(200, {
            "Content-Type": "application/zip",
            "Content-Length": statSync(EXPORT_ZIP).size,
            "Content-Disposition": 'attachment; filename="appstore-assets.zip"',
            "Cache-Control": "no-store",
          });
          createReadStream(EXPORT_ZIP).pipe(res);
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("POST only");
          return;
        }
        if (busy) {
          res.statusCode = 409;
          res.end("An export is already running.");
          return;
        }
        busy = true;

        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          let opts: { background?: string; frame?: string };
          try {
            opts = JSON.parse(body || "{}");
          } catch {
            busy = false;
            res.statusCode = 400;
            res.end("Body must be JSON.");
            return;
          }

          const flags: string[] = [];
          if (opts.background) flags.push("--background", opts.background);
          if (opts.frame) flags.push("--frame", opts.frame);

          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          });

          try {
            for (const command of ["frame", "preview", "manifest"]) {
              res.write(`$ gilded ${command}\n`);
              await run("bun", ["src/cli.ts", command, ...flags], GILDED_ROOT, res);
            }
            res.write("$ zip screenshots + previews\n");
            await rm(EXPORT_ZIP, { force: true });
            await run("zip", ["-r", "-q", EXPORT_ZIP, "screenshots", "previews"], OUT_DIR, res);
            res.write("[done]\n");
          } catch (err) {
            res.write(`[failed] ${err instanceof Error ? err.message : err}\n`);
          } finally {
            busy = false;
            res.end();
          }
        });
      });
    },
  };
}

function run(cmd: string, args: string[], cwd: string, res: ServerResponse): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, { cwd });
    child.stdout.on("data", (d) => res.write(d));
    child.stderr.on("data", (d) => res.write(d));
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? done() : fail(new Error(`exit code ${code}`))));
  });
}
