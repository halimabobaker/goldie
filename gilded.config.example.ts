import type { GildedConfig } from "./src/config.ts";

/**
 * Template. Copy to gilded.config.ts (here or in the app's own repo) and fill
 * in the app's values. Everything app-specific lives in the config and its
 * flows/ directory; every relative path resolves against the config file, and
 * out/ is created next to it. Point gilded at a config in another directory
 * with the GILDED_CONFIG env var.
 */

const APP_ROOT = "/absolute/path/to/the/app/repo";

const config: GildedConfig = {
  appRoot: APP_ROOT,
  // Release simulator build. A Debug build needs Metro and paints LogBox
  // banners into the captures.
  appPath: `${process.env.HOME}/Library/Developer/Xcode/DerivedData/<App>-<hash>/Build/Products/Release-iphonesimulator/<App>.app`,
  bundleId: "com.example.app",

  devices: ["iphone-6.9"], // keys from src/specs.ts
  locales: ["en-US"],
  appearance: "light",

  // Bundled bezel art: "17-pro-silver" | "17-pro-blue" | "17-pro-orange".
  // Custom art instead: frame: { image: "path/to/bezel.png" } (re-measure remotion/frame.ts).
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
    // screen; gilded takes the screenshot after its last step.
    {
      kind: "screenshot",
      id: "home",
      flow: "flows/01-home.yaml",
      headline: { "en-US": "Benefit-led headline" },
      subhead: { "en-US": "One short sentence expanding the headline." },
    },

    // One preview scene. Each segment is its own flow and clip; its caption
    // stays on screen for the clip's measured duration. Total video length
    // must land between 15 and 30 seconds.
    {
      kind: "preview",
      id: "preview",
      segments: [
        {
          id: "open",
          flow: "flows/preview-01-open.yaml",
          caption: { "en-US": "Your work, in one place" },
        },
        {
          id: "act",
          flow: "flows/preview-02-act.yaml",
          caption: { "en-US": "Do the core thing" },
          holdSeconds: 2,
        },
      ],
    },
  ],
};

export default config;
