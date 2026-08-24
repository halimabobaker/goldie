import type { GildedConfig } from "./src/config.ts";

const APP_ROOT = "/Users/kacperkapusciak/Dev/argent-task-plannning";

/**
 * Beacon is the example app. Everything app-specific lives here and in flows/ -
 * pointing gilded at a different app is a new config plus a new set of flows.
 */
const config: GildedConfig = {
  appRoot: APP_ROOT,
  appPath: `${process.env.HOME}/Library/Developer/Xcode/DerivedData/Beacon-cidsmuogvolonmhjpaauqtvdovlc/Build/Products/Release-iphonesimulator/Beacon.app`,
  bundleId: "com.beacon.tasktracker",

  devices: ["iphone-6.9"],
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

  store: {
    name: "Beacon",
    subtitle: { "en-US": "Issues, projects and progress" },
    developer: "Software Mansion",
    category: "Productivity",
    icon: `${APP_ROOT}/assets/images/icon.png`,
    rating: 4.8,
    ratingCount: "1.2K Ratings",
    ageRating: "4+",
    price: "Free",
    description: {
      "en-US":
        "Beacon keeps your team's work in one place. Every issue is grouped by " +
        "status and sorted the way your team actually works, so the next thing " +
        "to pick up is always the thing at the top.\n\n" +
        "File an issue in seconds, triage it without leaving the screen, and " +
        "watch it land back on the list with priority, assignee, project and " +
        "labels already set.",
    },
  },

  scenes: [
    {
      kind: "screenshot",
      id: "issues",
      flow: "flows/01-issues.yaml",
      headline: { "en-US": "Every issue, one list" },
      subhead: { "en-US": "Grouped by status, sorted the way your team works." },
    },
    {
      kind: "screenshot",
      id: "projects",
      flow: "flows/02-projects.yaml",
      headline: { "en-US": "Projects at a glance" },
      subhead: { "en-US": "Progress, owners and what is blocked, on one card." },
    },
    {
      kind: "screenshot",
      id: "search",
      flow: "flows/03-search.yaml",
      headline: { "en-US": "Find anything, fast" },
      subhead: { "en-US": "Search across issues, projects and people." },
    },
    {
      kind: "screenshot",
      id: "issue-detail",
      flow: "flows/04-issue-detail.yaml",
      headline: { "en-US": "The whole story" },
      subhead: { "en-US": "Priority, assignee, labels and activity in one place." },
    },
    {
      kind: "preview",
      id: "preview",
      segments: [
        {
          id: "open",
          flow: "flows/preview-01-open.yaml",
          caption: { "en-US": "Your team's work, in one place" },
        },
        {
          id: "compose",
          flow: "flows/preview-02-compose.yaml",
          caption: { "en-US": "File an issue in seconds" },
        },
        {
          id: "triage",
          flow: "flows/preview-03-triage.yaml",
          caption: { "en-US": "Triage without leaving the screen" },
        },
        {
          id: "create",
          flow: "flows/preview-04-create.yaml",
          caption: { "en-US": "Straight back to the list" },
          holdSeconds: 2,
        },
      ],
    },
  ],
};

export default config;
