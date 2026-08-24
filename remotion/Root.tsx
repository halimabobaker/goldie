import React from "react";
import { Composition } from "remotion";
import { Screenshot, type ScreenshotProps } from "./Screenshot";
import { Preview, type PreviewProps } from "./Preview";
import { FRAME } from "./frame";

/**
 * Both compositions are fully driven by inputProps - the CLI passes one props
 * file per render, so the same bundle serves every scene, device and locale.
 * The defaults below only exist so `remotion studio` opens on something.
 */

const SCREENSHOT_DEFAULTS: ScreenshotProps = {
  capture: "placeholder.png",
  headline: "Headline",
  background: "#0B1220",
  headlineColor: "#FFFFFF",
  subheadColor: "#9AA7B8",
  fontFamily: "system-ui, -apple-system, sans-serif",
  copyHeightRatio: 0.24,
  deviceWidthRatio: 0.82,
  width: 1320,
  height: 2868,
};

const PREVIEW_DEFAULTS: PreviewProps = {
  clips: [],
  background: "#0B1220",
  captionColor: "#FFFFFF",
  fontFamily: "system-ui, -apple-system, sans-serif",
  copyHeightRatio: 0.2,
  deviceWidthRatio: 0.86,
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Screenshot"
      component={Screenshot}
      durationInFrames={1}
      fps={30}
      width={SCREENSHOT_DEFAULTS.width}
      height={SCREENSHOT_DEFAULTS.height}
      defaultProps={SCREENSHOT_DEFAULTS}
      calculateMetadata={({ props }) => ({ width: props.width, height: props.height })}
    />
    <Composition
      id="Preview"
      component={Preview}
      durationInFrames={30}
      fps={30}
      width={886}
      height={1920}
      defaultProps={PREVIEW_DEFAULTS}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(
          1,
          props.clips.reduce((sum, c) => sum + c.durationInFrames, 0),
        ),
      })}
    />
  </>
);

export { FRAME };
