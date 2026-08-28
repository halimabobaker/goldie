# goldie.config.ts

One file holds everything app-specific. It exports a `GoldieConfig` (type from
`$GOLDIE/src/config.ts`). Every relative path in it resolves against the config
file itself, and `out/` is created next to it. Scene flows are the exception:
they are argent flow names resolved against `flowsDir`, which defaults to
`.argent/flows` inside `appRoot`.

## Annotated example

```ts
import type { GoldieConfig } from "/Users/<you>/Dev/goldie/src/config.ts";

const APP_ROOT = "/absolute/path/to/the/app/repo";

const config: GoldieConfig = {
  appRoot: APP_ROOT,
  // The Release simulator build found in Step 1. Absolute path.
  appPath: `${process.env.HOME}/Library/Developer/Xcode/DerivedData/<App>-<hash>/Build/Products/Release-iphonesimulator/<App>.app`,
  bundleId: "com.example.app",

  devices: ["iphone-6.9"],       // keys from $GOLDIE/src/specs.ts
  locales: ["en-US"],
  appearance: "light",           // simulator appearance for every capture

  // Bundled bezels: "17-pro-silver" | "17-pro-blue" | "17-pro-orange".
  // Pick the finish that contrasts with the background.
  frame: { variant: "17-pro-blue" },

  theme: {
    // Any CSS background. Soft brand-tinted gradients read best at store size.
    background: "linear-gradient(160deg, #E8F1FF 0%, #F7FAFF 55%, #FFFFFF 100%)",
    headlineColor: "#0E1B2A",    // must contrast with the background;
    subheadColor: "#5A6A7D",     // light text on a dark background and vice versa
    // The system stack, or a bundled typeface named first: "Merriweather",
    // "DM Mono", "Lato", "DM Sans", "Montserrat" (files in $GOLDIE/assets/fonts).
    fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
    copyHeightRatio: 0.24,       // fraction of frame height reserved for copy
    deviceWidthRatio: 0.84,      // fraction of frame width the bezel occupies
  },

  // Renders the realistic store page around the assets in the studio.
  store: {
    name: "AppName",
    subtitle: { "en-US": "Under 30 characters, Apple's limit" },
    developer: "Company Name",
    category: "Productivity",
    rating: 4.8,                 // cosmetic, studio only
    ratingCount: "1.2K Ratings",
    ageRating: "4+",
    price: "Free",
    description: { "en-US": "Two or three short paragraphs, store voice." },
  },

  // flowsDir: "../.argent/flows" by default, resolved from appRoot. Every
  // scene names a flow there, the way `argent flow run <name>` does.

  scenes: [
    // One entry per screenshot, in store-page order. The first two tiles are
    // what most visitors ever see, so lead with the strongest screens.
    {
      kind: "screenshot",
      id: "issues",
      flow: "store-01-issues",
      headline: { "en-US": "Every issue, one list" },
      subhead: { "en-US": "Grouped by status, sorted the way your team works." },
      // background: "..."  optional per-scene override
    },
    // ... 3 or 4 more screenshot scenes ...

    // Exactly one preview scene. Each segment is its own flow and clip; its
    // caption stays on screen for the clip's measured duration.
    {
      kind: "preview",
      id: "preview",
      segments: [
        { id: "open",    flow: "store-preview-01-open",    caption: { "en-US": "Your work, in one place" } },
        { id: "compose", flow: "store-preview-02-compose", caption: { "en-US": "File an issue in seconds" } },
        { id: "create",  flow: "store-preview-03-create",  caption: { "en-US": "Straight back to the list" }, holdSeconds: 2 },
      ],
    },
  ],
};

export default config;
```

Import the type with an absolute path to the goldie checkout, since the config
lives in the app repo.

## Writing the copy

- **Headlines**: 2 to 5 words, benefit-led, sentence case. Name what the user
  gets ("Find anything, fast"), never what the UI is ("Search screen").
- **Subheads**: one short sentence expanding the headline. Optional; drop it
  when the headline stands alone.
- **Preview captions**: together they narrate one continuous story in order.
  Keep each under about 6 words; viewers get seconds per caption.
- Match the app's existing voice (website, onboarding text) when the repo
  shows one.

## Output

| Asset | Spec | Location |
|---|---|---|
| 6.9" screenshots | 1320x2868 PNG, no alpha | `out/screenshots/6.9/<locale>/` |
| 6.9" preview | 886x1920 H.264 30fps AAC, 15 to 30 s | `out/previews/6.9/<locale>/` |

`goldie verify` checks the finished files against these with `sips` and
`ffprobe` and fails on any mismatch.
