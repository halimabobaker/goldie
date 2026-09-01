/**
 * Store asset specifications.
 * iOS: App Store Connect, developer.apple.com/help/app-store-connect/reference/
 *   screenshot-specifications | app-preview-specifications. Verified 2026-08-24.
 * Android: Play Console help, "Add preview assets". Phone screenshots are
 *   PNG/JPEG, 16:9 or 9:16, each side 320-3840px for promotional eligibility.
 *   Play accepts no video uploads (the promo video is a YouTube link), which
 *   is why `preview` is null on android devices.
 */

export type DeviceKey = "iphone-6.9" | "pixel-10-pro";

export type DeviceSpec = {
  /**
   * Display label for the studio and logs. Output paths use the DeviceKey,
   * so raw/, screenshots/ and previews/ all share one naming scheme.
   */
  label: string;
  platform: "ios" | "android";
  /**
   * `xcrun simctl` device type name; the toolkit picks the newest runtime that
   * has it. iOS only - android resolves a running emulator's adb serial instead.
   */
  simulatorName?: string;
  /**
   * Accepted AVD hardware profiles (`hw.device.name` in the AVD's config.ini),
   * in boot-preference order. Android only - a running emulator qualifies only
   * when its profile is listed, so captures always come from the intended
   * screen geometry. Every profile in the list must share that geometry.
   */
  avdDeviceNames?: string[];
  /**
   * Native capture resolution, portrait. null accepts the device's native
   * capture size as-is (Android emulators vary).
   */
  native: { width: number; height: number } | null;
  /** Required screenshot upload size, portrait. */
  screenshot: { width: number; height: number };
  /** Required app preview upload size, portrait. null: no app-preview video pipeline. */
  preview: { width: number; height: number } | null;
  /** Render bare screens with the drop shadow instead of a bezel. */
  screenOnly?: true;
};

export const DEVICES: Record<DeviceKey, DeviceSpec> = {
  "iphone-6.9": {
    label: "6.9",
    platform: "ios",
    simulatorName: "iPhone 17 Pro Max",
    native: { width: 1320, height: 2868 },
    screenshot: { width: 1320, height: 2868 },
    preview: { width: 886, height: 1920 },
  },
  // Framed with the bundled Pixel 10 Pro art (src/frame.ts), not the config's
  // frame variant, which is iPhone art with iPhone geometry. The Pixel 9 Pro
  // shares the 1280x2856 screen, so its emulator captures compose identically.
  "pixel-10-pro": {
    label: "Play phone",
    platform: "android",
    avdDeviceNames: ["pixel_10_pro", "pixel_9_pro"],
    native: null,
    screenshot: { width: 1080, height: 1920 },
    preview: null,
  },
};

/** Preview constraints Apple enforces at upload time. */
export const PREVIEW = {
  fps: 30,
  minSeconds: 15,
  maxSeconds: 30,
  /** Apple asks for 10-12 Mbps VBR on H.264. */
  videoBitrate: "11M",
  audioBitrate: "256k",
  audioSampleRate: 48000,
  maxBytes: 500 * 1024 * 1024,
} as const;

/** Screenshots may not carry an alpha channel. */
export const SCREENSHOT_PIXEL_FORMAT = "rgb24";
