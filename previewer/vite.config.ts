import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import type { ServerResponse } from "node:http";

const GILDED_ROOT = resolve(import.meta.dirname, "..");

/**
 * `out/web` is the static root: the manifest, the icon and symlinks to the
 * finished screenshots and previews, all served from `/`. Nothing is copied
 * into the previewer, so a re-run of `gilded all` shows up on reload - and a
 * `vite build` picks up only publishable assets, not the raw captures.
 * Run `gilded manifest` first; the directory does not exist before that.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), gildedApi()],
  publicDir: resolve(import.meta.dirname, "../out/web"),
  server: { port: 4321, open: true },
});

/**
 * POST /api/regenerate - re-runs the render pipeline against the existing raw
 * captures with one-run overrides, streaming the CLI log as plain text.
 * Body: { background?: string, frame?: string, video?: boolean }.
 * The response ends with "[done]" on success or "[failed]" otherwise, which
 * is what the UI keys off. Dev server only; a built dist stays static.
 */
function gildedApi(): Plugin {
  let busy = false;

  return {
    name: "gilded-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/regenerate", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("POST only");
          return;
        }
        if (busy) {
          res.statusCode = 409;
          res.end("A regeneration is already running.");
          return;
        }
        busy = true;

        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          let opts: { background?: string; frame?: string; video?: boolean };
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

          const commands = ["frame", ...(opts.video ? ["preview"] : []), "manifest"];
          try {
            for (const command of commands) {
              res.write(`$ gilded ${command}\n`);
              await run(["src/cli.ts", command, ...flags], res);
            }
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

function run(args: string[], res: ServerResponse): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn("bun", args, { cwd: GILDED_ROOT });
    child.stdout.on("data", (d) => res.write(d));
    child.stderr.on("data", (d) => res.write(d));
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? done() : fail(new Error(`exit code ${code}`))));
  });
}
