---
name: gilded
description: >-
  Create App Store screenshots and app preview videos for an iOS app with the
  gilded toolkit: explore the app on a simulator, author argent flows for its
  key user flows, render framed screenshots and a plain preview video, and open a local
  previewer showing the finished store page. Use this whenever the user asks
  for App Store screenshots, store assets, marketing screenshots, an app
  preview video, or mentions gilded, even if they only say something like
  "make screenshots for the store" or "I need App Store assets for this app".
  Run it from inside the mobile app's repo.
---

# gilded: App Store assets for the app in this repo

gilded replays argent YAML flows on an iOS simulator, captures raw screenshots
and recordings, and turns them into upload-ready assets: screenshots get a
device bezel, a background, and marketing copy; the preview video is the raw
recordings joined as-is, since Apple requires app previews to be a plain
screen recording with no framing or captions. A React previewer shows the
result as the real store page. Your job is everything gilded cannot do alone:
pick the screens worth marketing, author the flows that reach them, write the
copy, and drive the pipeline.

The end state: 4 or 5 framed screenshots and the raw clips for a preview video,
visible in the previewer at http://localhost:4321, with the video rendering in
the background.

## Step 0: Locate or install gilded

gilded is a standalone toolkit repo. Resolve it in this order:

1. `$GILDED_ROOT` if the env var is set
2. `~/Dev/gilded`
3. Clone it: `git clone https://github.com/kacperkapusciak/gilded.git ~/Dev/gilded && cd ~/Dev/gilded && bun install`

It needs `bun` on the PATH. Everything below refers to this checkout as
`$GILDED`. All app-specific files live in the app repo; gilded's own checkout
stays untouched.

## Step 1: Gather app facts

From the app repo, find:

- **App name and bundle id.** Look in the Xcode project, `app.json` /
  `app.config.*` (Expo), or `Info.plist`.
- **A Release simulator build.** Look for the newest
  `~/Library/Developer/Xcode/DerivedData/<App>-*/Build/Products/Release-iphonesimulator/<App>.app`.
  If only Debug exists, build Release: a Debug build needs Metro and paints
  LogBox banners into the captures, so it makes unusable marketing assets.
  Use the repo's own build scripts if it has them.

## Step 2: Explore the app and choose the scenes

Use argent MCP tools to see the app before deciding anything. Boot an iPhone
16 Pro Max class simulator, install the Release build, launch it, and walk the
main screens with `describe` and `screenshot`. Also check the app repo for
existing recorded flows in `.argent/flows/`; they are the best source of
working selectors and coordinates.

Choose:

- **4 or 5 screenshot scenes.** Each is one screen that sells a feature: the
  main list, a detail view, search, a distinctive feature screen. Prefer
  screens with real-looking content.
- **A 3 or 4 segment preview story.** One short user journey told in order,
  for example: see the main screen, start a core action, complete it, see the
  result. Each segment becomes one clip. The clips are joined with no
  captions or framing, so each step must read on its own, and the total video
  must land between 15 and 30 seconds.

While exploring, note the exact visible text labels and accessibility ids you
will need as selectors, and normalized coordinates for anything with no label
(icon-only tab bars are the usual case).

## Step 3: Author the config and flows

The flows are argent flows and belong in the app's own flow store, next to any
flow already recorded there. The config sits in a `gilded/` directory:

```
<app-repo>/
├── .argent/flows/
│   ├── store-01-<scene>.yaml ...        one per screenshot scene
│   └── store-preview-01-<segment>.yaml  one per preview segment
└── gilded/gilded.config.ts
```

A scene names its flow the way `argent flow run <name>` does: `flow:
"store-01-home"` runs `.argent/flows/store-01-home.yaml`. Prefix the marketing
flows so they read apart from the app's test flows, and reuse an existing flow
by name when one already reaches the screen. `flowsDir` in the config overrides
the location; the default is `.argent/flows` under `appRoot`.

Read `references/config.md` for the config schema, an annotated example, and
copywriting guidance. Read `references/flows.md` for the flow YAML vocabulary
and the conventions that keep flows replayable. Write the headlines and
subheads yourself in the app's voice; they are the marketing layer, so make
them benefit-led and short.

Everything renders relative to the config file: output lands in
`<app-repo>/gilded/out/`. Add `gilded/out/` to the app's `.gitignore`, and
commit `gilded.config.ts` and the flows.

Because they are plain argent flows, each one is runnable on its own with
`argent flow run store-01-home` from the app repo, which is the fastest way to
check a flow before a full capture.

## Step 4: Doctor, then capture

Every gilded command reads the config path from the `GILDED_CONFIG` env var.
Shell state does not persist between your Bash calls, so prefix every gilded
command with it:

```bash
GILDED_CONFIG=<app-repo>/gilded/gilded.config.ts bun $GILDED/src/cli.ts doctor
```

Fix everything doctor flags before capturing. The usual findings and their
fixes are in the Gotchas section of gilded's README; the common ones are the
argent video watermark flag, a screenshot scale override, and a Debug build.

Then capture and render the stills (skip the video for now, it takes minutes):

```bash
GILDED_CONFIG=... bun $GILDED/src/cli.ts capture
GILDED_CONFIG=... bun $GILDED/src/cli.ts frame
GILDED_CONFIG=... bun $GILDED/src/cli.ts manifest
```

`capture` replays every flow, including the preview segments, so the raw clips
exist for the lazy video render later.

### When a flow breaks

Flows replay with no LLM, so a wrong selector fails loudly. gilded prints the
failed step and argent's reason. Fix it over argent MCP: `describe` the live
screen to find the real label or id, correct the YAML, and re-run capture.
Prefer `text:` and `id:` selectors; when only a coordinate works, add an
`echo:` step above it explaining what it points at, so the next repair knows
what to re-resolve.

## Step 5: Open the previewer, render the video lazily

Start the previewer in the background from the gilded checkout. It needs
`GILDED_CONFIG` too, so it serves the app repo's `out/`:

```bash
cd $GILDED && GILDED_CONFIG=... bun run previewer   # background task; serves http://localhost:4321
```

Tell the user it is up at http://localhost:4321. Then, also in the background,
render the preview video so it appears on reload once done:

```bash
GILDED_CONFIG=... bun $GILDED/src/cli.ts preview && GILDED_CONFIG=... bun $GILDED/src/cli.ts manifest
```

If `preview` refuses because the total is outside 15 to 30 seconds, adjust
segment pacing (`wait:` steps and `holdSeconds`) and re-capture only what
changed.

Finish with `bun $GILDED/src/cli.ts verify` and report the result: which
assets exist, where they are, and whether they pass Apple's rules. The
previewer's sidebar shows the same checks; a red row is a rule violation. The
Generate panel lets the user restyle backgrounds and bezels without you, and
Export downloads an upload-ready zip.
