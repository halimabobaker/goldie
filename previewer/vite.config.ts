import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

const SRC_DIR = resolve(import.meta.dirname, "src");

const GOLDIE_ROOT = resolve(import.meta.dirname, "..");
// GOLDIE_CONFIG points at a config outside this repo; out/ and the design
// sidecar live next to it.
const CONFIG_DIR = process.env.GOLDIE_CONFIG
  ? dirname(resolve(process.env.GOLDIE_CONFIG))
  : GOLDIE_ROOT;
const OUT_DIR = join(CONFIG_DIR, "out");
/** Mirrors designPath() in src/config.ts. */
const DESIGN_FILE = join(CONFIG_DIR, "goldie.design.json");
const EXPORT_ZIP = join(OUT_DIR, "export.zip");

/**
 * `out/web` is the static root: the manifest, the bezel art and
 * symlinks to the raw captures and finished assets, all served from `/`.
 * Nothing is copied into the previewer, so a re-run of `goldie capture` shows
 * up on reload. Run `goldie manifest` first; the directory does not exist
 * before that. `fs.allow` covers the goldie root because the previewer imports
 * src/frame.ts for the shared bezel geometry.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), goldieApi()],
  resolve: { alias: { "@": SRC_DIR } },
  publicDir: join(OUT_DIR, "web"),
  server: { port: 4321, open: true, fs: { allow: [GOLDIE_ROOT, OUT_DIR] } },
});

/**
 * POST /api/export - renders the final assets from the raw captures with the
 * chosen background and frame (goldie frame + preview + manifest), zips
 * out/screenshots and out/previews, and streams the CLI log as plain text.
 * Body: { background?: string, frame?: string, font?: string }.
 * The response ends with "[done]" on success or "[failed]" otherwise; on
 * "[done]" the UI downloads GET /api/export/download. Dev server only; a
 * built dist stays static.
 *
 * GET/PUT /api/design - the design choices saved next to the config as
 * goldie.design.json ({ background?, frame?, fontFamily? }). The CLI's
 * loadConfig() applies the file, so a saved choice also shapes plain
 * `goldie frame` runs. The UI debounces its PUTs; the server writes the file
 * atomically so a half-written JSON never reaches the CLI.
 */
function goldieApi(): Plugin {
  let busy = false;

  return {
    name: "goldie-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/design", (req, res) => {
        if (req.method === "GET") {
          readFile(DESIGN_FILE, "utf8").then(
            (json) => {
              res.writeHead(200, {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              });
              res.end(json);
            },
            () => {
              res.writeHead(200, {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              });
              res.end("{}");
            },
          );
          return;
        }
        if (req.method !== "PUT") {
          res.statusCode = 405;
          res.end("GET or PUT only");
          return;
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          let design: Record<string, unknown>;
          try {
            design = JSON.parse(body);
            if (!design || typeof design !== "object") throw new Error();
          } catch {
            res.statusCode = 400;
            res.end("Body must be a JSON object.");
            return;
          }
          try {
            const tmp = `${DESIGN_FILE}.tmp`;
            await writeFile(tmp, `${JSON.stringify(design, null, 2)}\n`);
            await rename(tmp, DESIGN_FILE);
            res.statusCode = 204;
            res.end();
          } catch (err) {
            res.statusCode = 500;
            res.end(err instanceof Error ? err.message : String(err));
          }
        });
      });

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
          let opts: { background?: string; frame?: string; font?: string };
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
          if (opts.font) flags.push("--font", opts.font);

          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          });

          try {
            for (const command of ["frame", "preview", "manifest"]) {
              res.write(`$ goldie ${command}\n`);
              await run("bun", ["src/cli.ts", command, ...flags], GOLDIE_ROOT, res);
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
