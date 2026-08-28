# goldie

<img width="1580" height="844" alt="Screenshot 2026-08-28 at 1 58 06 PM" src="https://github.com/user-attachments/assets/ba5a22af-2b7f-4544-9bef-5b9ccc5c789f" />

goldie makes App Store screenshots and app preview videos for an iOS app.
[argent](https://github.com/software-mansion/argent) replays YAML flows on a
simulator and captures raw images and recordings.
goldie composites the screenshots with a device frame, a background, and
headline copy, and joins the recordings into a plain preview video, since
Apple requires app previews to show the device screen and nothing else. The
output matches Apple's upload rules.

```
goldie doctor     Check the tools, simulators, flags and flows
goldie capture    Replay each flow and save the raw captures
goldie frame      Make framed, captioned PNGs from the raw screenshots
goldie preview    Make the app preview video from the raw clips
goldie verify     Check the finished assets against Apple's rules
goldie manifest   Write out/web/store.json for the studio
goldie all        capture -> frame -> preview -> manifest -> verify
```

## Install

```
npm i -g goldie        # or run it ad hoc:  npx goldie@0 doctor
brew install ffmpeg
```

The package bundles [argent](https://github.com/software-mansion/argent) as a
dependency, so nothing else is needed. macOS with Xcode and its simulators is
required. Node 20 or newer; no bun.

All app-specific data is in `goldie.config.ts`, which is untracked; copy
`goldie.config.example.ts` to start. Set `GOLDIE_CONFIG` to use a config in
another directory, for example in the app's own repo; `out/` is created next to
the config file.

The scenes point at argent flows in the app repo's `.argent/flows`, by the same
name `argent flow run <name>` takes. goldie and argent share one flow store, so
a flow recorded with `argent` replays here unchanged and a marketing flow stays
runnable on its own. Set `flowsDir` in the config to keep them somewhere else.

## Install the skill

The repo has a Claude skill in `skills/goldie/`. The skill explores the app on
a simulator, writes the flows into `.argent/flows` and the config, runs the
pipeline with `npx goldie@0`, and opens the studio. Install it one of two ways:

```
npx skills add kacperkapusciak/goldie       # skills.sh CLI, any agent
```

```
/plugin marketplace add kacperkapusciak/goldie   # Claude Code
/plugin install goldie@goldie
```

The Claude Code plugin also registers argent's MCP server (`.mcp.json`), which
the skill uses to explore the app and repair flows.

Then ask Claude from the app repo: "create App Store screenshots using goldie".

The result is a `goldie/goldie.config.ts` and a set of flows in the app repo.
They hold every choice the skill made, so later prompts iterate on them
instead of starting over: "make the headlines punchier", "use a dark
background", "replace the search screenshot with settings". The skill reads
the existing config, edits only what you asked for, and re-runs the stage
that reflects it.

## Output

| Asset | Size | Location |
|---|---|---|
| 6.9" screenshots | 1320 x 2868, no alpha | `out/screenshots/6.9/<locale>/` |
| 6.9" app preview | 886 x 1920, H.264, 30 fps, AAC | `out/previews/6.9/<locale>/` |

`goldie verify` reads these values from the finished files with `sips` and
`ffprobe`. If a file does not match Apple's rules, the command fails.

## Preview the assets

```
goldie studio       # http://localhost:4321
bun run studio      # same, from a source checkout with hot reload
```

The studio is a React + Vite + Tailwind app. It shows the assets as the
five-tile strip from the store page: the video first, then the screenshots.
Each tile is the exact file for upload. The sidebar lists each file with its
size and weight. A row turns red when the file breaks Apple's rules.

The Design panel has 25 background presets (including a transparent one that
exports with an alpha channel, for compositing elsewhere), a gradient picker, a template
dropdown (or a single layout), a bezel or screen-only switch, and a font
dropdown. Every change is
composited in the browser at once. Clicking a tile opens it full size, where
the headline and subhead are editable and a dropdown overrides that one
tile's layout. These choices are saved to `goldie.design.json` next to the
config, so the CLI renders the same thing. Export runs the render pipeline on
the existing raw captures, streams the log, and downloads an upload-ready
zip. The CLI has one-run overrides too: `--background`, `--frame`, `--font`,
`--template`, `--layout` and `--screen-only`. `goldie.config.ts` stays the
source of truth.

The app reads `out/web/`: the manifest and symlinks to the finished
assets. `out/raw` and `out/stage` are outside it. `goldie studio` serves the
prebuilt `studio/dist` from the package together with `out/web` and the
design/export API (`src/studio-server.ts`); the Vite dev server mounts the
same handlers.

## Develop and release

```
bun install
bun run check       # biome
bun test
bun run build       # studio/dist + dist/ (CLI and library, Node target)
npm pack --dry-run  # what ships
```

Pushing a `v*` tag publishes to npm through `.github/workflows/release.yml`
(needs an `NPM_TOKEN` repository secret). The skill pins the CLI by major
(`npx goldie@0`), so skill edits and CLI releases ship independently until
the next major.

## How a run works

1. **prepare** - Reuse the booted simulator. Only when it is shut down, or
   when its keyboard and locale are not pinned yet, shut it down, set the
   language, turn off keyboard autocorrect, and boot. Then set the appearance
   and pin the status bar.
2. **install** - Reinstall the app and clear its data. Each run then starts
   from the same empty state. This makes a re-capture deterministic.
3. **capture** - Replay each flow with `argent flow run`. A screenshot scene
   ends with a full-resolution `screenshot` call. Each preview segment has its
   own `screen-recording-start` and `screen-recording-stop` pair.
4. **composite** - The stills are drawn on a canvas from the raw captures,
   the bezel, and the config text. The video is an ffmpeg join of the raw
   clips, scaled to the upload size.

## Preview timing

The preview is one short clip per segment, joined in config order exactly as
recorded. App Store previews may not be framed or captioned, so a segment's
message has to come from what happens on screen.

Apple requires a total length of 15 to 30 seconds. `goldie preview` refuses to
render outside this window. Adjust the length with segment `holdSeconds` and
`wait:` steps in the flows.

## When a flow breaks

Flows replay with no LLM. A flow fails when the app changes, for example a
moved button or a new label. goldie then prints the failed step, the reason
from argent, and the commands to fix it:

```
FLOW FAILED  scene "issues"
  step    #2 await visible "All issues"
  reason  no element matched selector text="All issues"
```

Claude can fix the flow over argent MCP (`describe`, `flow-start-recording`,
`flow-add-step`), which writes straight into `.argent/flows`. Commit the
corrected YAML and review it. Prefer `text:` and
`id:` selectors. Coordinate selectors drift between device sizes.

## Gotchas

- **`video-watermark` is on by default.** Recordings then carry the argent
  watermark. `doctor` checks it. `argent disable video-watermark` fixes it.
- **`screenshot` defaults to `scale: 0.25`.** Captures pass `scale: 1.0` and
  `includeImageInContext: false`. `doctor` fails if `ARGENT_SCREENSHOT_SCALE`
  is set to another value.
- **`screen-recording-start` defaults `trimStatic: true`, `showTouches: true`.**
  Both are off here. Trimming breaks real-time pacing. The touch pulse does not
  belong in a marketing video.
- **A simulator reboot breaks argent's transport session.** Each later `launch`
  step then fails. `prepare` restarts the tool-server after a boot, and skips
  the reboot altogether when the device is already booted and pinned.
- **Simulator autocorrect changes typed text.** Preferences are read at process
  start, so they go into the shut-down device's store, before boot. That is the
  one thing a reboot is still spent on.
- **Use a Release build.** A Debug build needs Metro and paints LogBox banners
  into the captures. `doctor` warns when `appPath` points at
  `Debug-iphonesimulator`.
- **Re-captures are stable in content, not byte-identical.** Only the Dynamic
  Island and the tab bar's glass blur differ between runs.
- **The status bar shows 9:37 in preview clips and 9:41 in stills.** The flow
  runner pins its own status bar during a run. Stills are captured after the
  run, so they keep 9:41.

## Choose a device frame for the screenshots

Three bezel finishes ship in `assets/`. Pick one in the config:

```ts
frame: { variant: "17-pro-blue" }   // or "17-pro-silver", "17-pro-orange"
```

All bundled variants share the cutout geometry in `src/frame.ts`. Custom
bezel art works too: `frame: { image: "path/to/bezel.png" }`, relative to the
config file. Measure its geometry from its alpha channel.

## Choose a template and layouts

A template is the rhythm of the whole strip: the layout each screenshot takes
in store order, so one strip can open on a panorama, follow with a hero and a
tilted device, and rest on a minimal tile. Pick a built-in or write your own
sequence (it repeats when shorter than the scene list):

```ts
theme: { template: "editorial" }
theme: { template: ["panorama", "hero", "tilt", "minimal", "duo"] }
```

| Template | Sequence |
|---|---|
| `editorial` | panorama, hero, offset, minimal, tilt |
| `showcase` | hero, tilt, duo, tilt-right, minimal |
| `magazine` | offset, copy-below, tilt-right, hero, minimal |
| `storyboard` | panorama-duo, copy-below, hero, minimal, tilt |
| `dynamic` | tilt, duo-tilt, panorama, minimal, tilt-right |

Without a template, `theme.layout` applies to every tile; `scenes[].layout`
overrides one tile either way. The layouts, from `src/layouts.ts`:

| Layout | What it does |
|---|---|
| `classic` | Centred copy above a centred device (the default) |
| `copy-below` | Device hanging from the top edge, copy underneath |
| `hero` | Copy on top, a large device running off the bottom |
| `offset` | Left-aligned copy, device pushed to the bottom right |
| `tilt` | Copy on top, device tilted and running off the bottom |
| `tilt-right` | Left-aligned copy, device tilted into the bottom right corner |
| `duo` | Two screens, a smaller one behind on the left |
| `duo-tilt` | Two tilted screens stepping down diagonally |
| `panorama` | Two tiles: copy on the left, one big tilted device across the seam |
| `panorama-duo` | Two tiles sharing one headline, a screen on each side |
| `minimal` | No copy, just a large centred device |

The two-screen layouts show a second capture: the next scene's by default,
or `secondScene: "issue-detail"` to pick one. A panorama is rendered once at double width
and sliced into two store-sized PNGs, numbered consecutively; it counts as
two of Apple's ten screenshots.

`theme.screenOnly: true` drops the bezel and shows the bare screen with a
soft shadow, in every layout. Decorations add layers between the background
and the device, on the theme (every tile) or on one scene:

```ts
decorations: [
  { kind: "badge", text: { "en-US": "Editors' Choice" }, position: "top-right" },
  { kind: "image", src: "art/sticker.png", x: 0.7, y: 0.1, width: 0.25, rotate: 12 },
]
```

The geometry and type sizes live only in `src/layouts.ts`; the CLI and the
studio both compose from it, so a tile in the browser is the exported PNG.
`bun test` checks that `classic` still matches the original composition.

## Choose a font for the copy

`theme.fontFamily` is a CSS font stack. The system stack (SF Pro) needs no
setup. Five typefaces ship in `assets/fonts/` (Google Fonts, OFL):
Merriweather, DM Mono, Lato, DM Sans and Montserrat. Name one first in the
stack and both the renderer and the studio use the bundled files:

```ts
fontFamily: '"DM Sans", system-ui, sans-serif'
```

`src/fonts.ts` lists the keys for the CLI (`--font dm-sans`) and the
studio's Font dropdown. Other fonts must be installed on the machine that
renders, and the studio's browser needs them too.

## Add a device size

Add an entry to `DEVICES` in `src/specs.ts`: the simulator name, the native
capture resolution, and the upload sizes from Apple's spec tables. Then list
the key in the config's `devices`. No other code is size-aware.
