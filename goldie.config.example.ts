import type { GoldieConfig } from "./src/config.ts";

/**
 * Template. Copy to goldie.config.ts (here or in the app's own repo) and fill
 * in the app's values. Every relative path resolves against the config file,
 * and out/ is created next to it. Point goldie at a config in another
 * directory with the GOLDIE_CONFIG env var.
 *
 * Scene flows are argent flows: they live in the app repo's .argent/flows and
 * are named the way `argent flow run <name>` names them, so a flow recorded
 * with argent replays here unchanged. Set flowsDir to keep them elsewhere.
 */

const APP_ROOT = "/absolute/path/to/the/app/repo";

const config: GoldieConfig = {
  appRoot: APP_ROOT,
  // flowsDir: ".argent/flows" under appRoot by default.
  // Release simulator build. A Debug build needs Metro and paints LogBox
  // banners into the captures.
  appPath: `${process.env.HOME}/Library/Developer/Xcode/DerivedData/<App>-<hash>/Build/Products/Release-iphonesimulator/<App>.app`,
  bundleId: "com.example.app",

  devices: ["iphone-6.9"], // keys from src/specs.ts
  locales: ["en-US"],
  appearance: "light",

  // Bundled bezel art for the screenshots: "17-pro-silver" | "17-pro-blue" | "17-pro-orange".
  // Custom art instead: frame: { image: "path/to/bezel.png" } (re-measure src/frame.ts).
  frame: { variant: "17-pro-blue" },

  theme: {
    background: "linear-gradient(160deg, #E8F1FF 0%, #F7FAFF 55%, #FFFFFF 100%)",
    headlineColor: "#0E1B2A",
    subheadColor: "#5A6A7D",
    fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
    copyHeightRatio: 0.24,
    deviceWidthRatio: 0.84,
  },

  // Renders the realistic store page around the assets in the previewer.
  store: {
    name: "AppName",
    subtitle: { "en-US": "Under 30 characters" },
    developer: "Company Name",
    category: "Productivity",
    rating: 4.8, // cosmetic, previewer only
    ratingCount: "1.2K Ratings",
    ageRating: "4+",
    price: "Free",
    description: { "en-US": "Two or three short paragraphs, store voice." },
  },

  scenes: [
    // One entry per screenshot, in store-page order. The flow navigates to the
    // screen; goldie takes the screenshot after its last step. Flow values are
    // argent flow names under .argent/flows (a path under it also works).
    {
      kind: "screenshot",
      id: "home",
      flow: "store-01-home",
      headline: { "en-US": "Benefit-led headline" },
      subhead: { "en-US": "One short sentence expanding the headline." },
    },

    // One preview scene. Each segment is its own flow and clip; the clips are
    // joined as recorded, since Apple requires a plain screen recording (no
    // bezel or captions). Total video length must land between 15 and 30
    // seconds.
    {
      kind: "preview",
      id: "preview",
      segments: [
        {
          id: "open",
          flow: "store-preview-01-open",
        },
        {
          id: "act",
          flow: "store-preview-02-act",
          holdSeconds: 2,
        },
      ],
    },
  ],
};

export default config;
