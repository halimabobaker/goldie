# gilded

App Store screenshots and app previews for an iOS app, generated end to end:
[argent](https://github.com/software-mansion/argent) replays YAML flows on a
simulator to capture raw stills and screen recordings, and
[Remotion](https://remotion.dev) composites them into framed, captioned assets
that match Apple's upload specs exactly.

```
gilded doctor     Check the toolchain, simulators, flags and flows
gilded capture    Replay every scene flow and save raw captures
gilded frame      Composite raw screenshots into framed, captioned PNGs
gilded preview    Composite raw clips into the app preview video
gilded verify     Check finished assets against Apple's spec table
gilded manifest   Write out/web/store.json for the previewer
gilded all        capture -> frame -> preview -> manifest -> verify
```

Everything app-specific is `gilded.config.ts` plus `flows/`. The example config
targets Beacon (`~/Dev/argent-task-plannning`).

## What it produces

| Asset | Size | Where |
|---|---|---|
| 6.9" screenshots | 1320 x 2868, no alpha | `out/screenshots/6.9/<locale>/` |
| 6.9" app preview | 886 x 1920, H.264, 30 fps, AAC | `out/previews/6.9/<locale>/` |

`gilded verify` re-derives every one of those numbers from the finished files
with `sips` and `ffprobe`, so a spec drift fails loudly instead of at upload.

## Previewing the assets

```
bun run previewer      # http://localhost:4321
```

A React + Vite + Tailwind app that shows the finished assets as the five-up
strip they form on the store page: the app preview video first, then the framed
screenshots, each tile exactly the file that would be uploaded. The sidebar
lists every file with its dimensions and weight, and turns a row red when it
does not match what Apple requires for that device.

The dev server is an active tool, not just a viewer. The sidebar's Generate
panel offers 16 background presets, a two-stop gradient picker with an angle
slider, a solid color picker and a raw CSS field, plus a bezel-variant
dropdown. Any change regenerates the screenshots automatically (debounced, and
queued if a run is already in flight) via `POST /api/regenerate`, which re-runs
the render pipeline against the existing raw captures and streams the CLI log.
The preview video is opt-in through the "Include video" toggle since it takes a
couple of minutes; while it re-renders, its tile shows a loading skeleton. The
same overrides exist on the CLI as `--background` and `--frame`; they apply to
a single run, so `gilded.config.ts` stays the source of truth until a value is
copied into it.

The app reads `out/web/` - the manifest, the app icon, and symlinks to the
finished screenshots and previews. `out/raw` and `out/stage` are deliberately
outside it, so `bun run previewer:build` produces a deployable `previewer/dist`
rather than a copy of every intermediate capture - though the static build has
no API and stays a plain viewer.

## How a run works

1. **prepare** - shut the simulator down, pin its language and turn off keyboard
   autocorrect and prediction, boot, set the appearance, pin the status bar.
2. **install** - reinstall the app, wiping its data. This is what makes a
   re-capture deterministic: flows that create records start from the same
   empty state every time.
3. **capture** - each scene's flow replays with `argent flow run`. Screenshot
   scenes end with a native-resolution `screenshot` call; preview segments are
   each wrapped in their own `screen-recording-start`/`-stop` pair.
4. **composite** - Remotion renders the stills and the video from the raw
   captures, the bezel and the config's copy.

## Preview timing

The preview is recorded as one short clip per caption rather than one long
take. A caption's on-screen duration is then the clip's own measured length -
exact by construction, and it survives a re-record. (The alternative, one long
recording with hand-counted frame offsets, is what
`~/Dev/argent-remotion-flows/src/flow/timeline.ts` had to maintain.)

Total duration must land in Apple's 15-30 s window; `gilded preview` refuses to
render outside it. Tune it with segment `holdSeconds` and the `wait:` steps in
the flows.

## When a flow breaks

Flows replay with no LLM in the loop. When one fails - the app moved a button, a
label changed - `gilded` prints the failing step, the reason argent gave, and
the commands to re-resolve it:

```
FLOW FAILED  scene "issues"
  step    #2 await visible "All issues"
  reason  no element matched selector text="All issues"
```

Claude can do the re-resolution over argent MCP (`describe`,
`flow-start-recording`, `flow-add-step`), but the corrected YAML is a reviewed
commit, not a silent self-repair. Prefer `text:`/`id:` selectors: the
coordinates inherited from the app's own flows were recorded on a different
device size and several of them had drifted.

## Gotchas this hit, so you don't have to

- **`video-watermark` is on by default.** Every recording would carry the argent
  corner watermark. `doctor` checks it; `argent disable video-watermark` fixes it.
- **`screenshot` defaults to `scale: 0.25`.** Captures pass `scale: 1.0` and
  `includeImageInContext: false` explicitly, and `doctor` fails if
  `ARGENT_SCREENSHOT_SCALE` is set to anything else.
- **`screen-recording-start` defaults `trimStatic: true`, `showTouches: true`.**
  Both are off here: trimming destroys real-time pacing and the touch pulse is
  an overlay you do not want in a marketing video.
- **Rebooting a simulator invalidates argent's transport session.** Every later
  `launch` step then fails its native-devtools handshake. `prepare` restarts the
  tool-server after booting.
- **Simulator autocorrect rewrites typed copy.** A title typed as "Sync
  conflicts when editing offline" came back as "Synu cofnęlibyśmy when emitent
  offline" on a Polish keyboard. Preferences are written into the shut-down
  device's store, before boot.
- **Use a Release build.** A Debug build needs Metro running and paints LogBox
  banners and bundle-download indicators straight into the captures. `doctor`
  warns when `appPath` points at `Debug-iphonesimulator`.
- **Re-captures are stable in content, not byte-identical.** Two runs of the
  same flows differ only in the Dynamic Island and the tab bar's glass blur -
  a live blur over scrolled content will not settle to the same pixels. App
  content, layout and the status bar are identical run to run.
- **The status bar reads 9:37 inside preview clips, 9:41 in stills.** The flow
  runner pins its own status bar for the duration of a run, overriding the 9:41
  set before recording starts. Stills are captured after the run, so they keep
  9:41.

## Choosing a device frame

Three bezel finishes ship in `assets/` and are picked in the config:

```ts
frame: { variant: "17-pro-blue" }   // or "17-pro-silver", "17-pro-orange"
```

All bundled variants share the cutout geometry in `remotion/frame.ts`. Custom
bezel art works too - `frame: { image: "path/to/bezel.png" }`, relative to the
config file - but needs that geometry re-measured from its alpha channel.

## Adding a device size

Add an entry to `DEVICES` in `src/specs.ts` with the simulator name, its native
capture resolution and the required upload sizes from Apple's spec tables, then
list its key in the config's `devices`. Nothing else is size-aware.
