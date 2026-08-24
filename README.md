# gilded

gilded makes App Store screenshots and app preview videos for an iOS app.
[argent](https://github.com/software-mansion/argent) replays YAML flows on a
simulator and captures raw images and recordings.
[Remotion](https://remotion.dev) adds the device frame, the background, and the
captions. The output matches Apple's upload rules.

```
gilded doctor     Check the tools, simulators, flags and flows
gilded capture    Replay each flow and save the raw captures
gilded frame      Make framed, captioned PNGs from the raw screenshots
gilded preview    Make the app preview video from the raw clips
gilded verify     Check the finished assets against Apple's rules
gilded manifest   Write out/web/store.json for the previewer
gilded all        capture -> frame -> preview -> manifest -> verify
```

All app-specific data is in `gilded.config.ts`, which is untracked; copy
`gilded.config.example.ts` to start. Set `GILDED_CONFIG` to use a config in
another directory, for example in the app's own repo; `out/` is created next to
the config file.

The scenes point at argent flows in the app repo's `.argent/flows`, by the same
name `argent flow run <name>` takes. gilded and argent share one flow store, so
a flow recorded with `argent` replays here unchanged and a marketing flow stays
runnable on its own. Set `flowsDir` in the config to keep them somewhere else.

## Install the skill

The repo has a Claude skill in `skills/gilded/`. The skill explores the app on
a simulator, writes the flows into `.argent/flows` and the config, runs the
pipeline, and opens the
previewer. Install it with the [skills.sh](https://skills.sh) CLI:

```
npx skills add kacperkapusciak/gilded
```

Then ask Claude from the app repo: "create App Store screenshots using gilded".

## Output

| Asset | Size | Location |
|---|---|---|
| 6.9" screenshots | 1320 x 2868, no alpha | `out/screenshots/6.9/<locale>/` |
| 6.9" app preview | 886 x 1920, H.264, 30 fps, AAC | `out/previews/6.9/<locale>/` |

`gilded verify` reads these values from the finished files with `sips` and
`ffprobe`. If a file does not match Apple's rules, the command fails.

## Preview the assets

```
bun run previewer      # http://localhost:4321
```

The previewer is a React + Vite + Tailwind app. It shows the assets as the
five-tile strip from the store page: the video first, then the screenshots.
Each tile is the exact file for upload. The sidebar lists each file with its
size and weight. A row turns red when the file breaks Apple's rules.

The dev server can also regenerate assets. The Generate panel has 16 background
presets, a gradient picker, a color picker, a CSS field, and a bezel dropdown.
When you change a value, the server runs the render pipeline again on the
existing raw captures and streams the log. The video is behind an "Include
video" toggle because it takes some minutes. The CLI has the same overrides:
`--background` and `--frame`. They apply to one run only. `gilded.config.ts`
stays the source of truth.

The app reads `out/web/`: the manifest and symlinks to the finished
assets. `out/raw` and `out/stage` are outside it. Because of this,
`bun run previewer:build` makes a small deployable `previewer/dist`. The static
build has no API. It is a viewer only.

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
4. **composite** - Remotion renders the stills and the video from the raw
   captures, the bezel, and the config text.

## Preview timing

The preview is one short clip for each caption. A caption stays on screen for
the measured length of its clip. This stays correct after a re-record. The old
approach was one long recording with hand-counted frame offsets
(`~/Dev/argent-remotion-flows/src/flow/timeline.ts`).

Apple requires a total length of 15 to 30 seconds. `gilded preview` refuses to
render outside this window. Adjust the length with segment `holdSeconds` and
`wait:` steps in the flows.

## When a flow breaks

Flows replay with no LLM. A flow fails when the app changes, for example a
moved button or a new label. gilded then prints the failed step, the reason
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

## Choose a device frame

Three bezel finishes ship in `assets/`. Pick one in the config:

```ts
frame: { variant: "17-pro-blue" }   // or "17-pro-silver", "17-pro-orange"
```

All bundled variants share the cutout geometry in `remotion/frame.ts`. Custom
bezel art works too: `frame: { image: "path/to/bezel.png" }`, relative to the
config file. Measure its geometry from its alpha channel.

## Add a device size

Add an entry to `DEVICES` in `src/specs.ts`: the simulator name, the native
capture resolution, and the upload sizes from Apple's spec tables. Then list
the key in the config's `devices`. No other code is size-aware.
