import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { layout } from "./frame";

export type ScreenshotProps = {
  /** Path under the staging public dir (out/stage) of the raw device capture. */
  capture: string;
  headline: string;
  subhead?: string;
  background: string;
  headlineColor: string;
  subheadColor: string;
  fontFamily: string;
  copyHeightRatio: number;
  deviceWidthRatio: number;
  width: number;
  height: number;
};

export const Screenshot: React.FC<ScreenshotProps> = ({
  capture,
  headline,
  subhead,
  background,
  headlineColor,
  subheadColor,
  fontFamily,
  copyHeightRatio,
  deviceWidthRatio,
  width,
  height,
}) => {
  const copyHeight = height * copyHeightRatio;
  const { frame, screen } = layout({ width, height }, deviceWidthRatio, copyHeight, height * 0.03);

  return (
    <AbsoluteFill style={{ background, fontFamily }}>
      <AbsoluteFill
        style={{
          height: copyHeight,
          padding: `${height * 0.055}px ${width * 0.09}px 0`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: height * 0.014,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            color: headlineColor,
            fontSize: width * 0.082,
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: -width * 0.0016,
          }}
        >
          {headline}
        </h1>
        {subhead ? (
          <p style={{ margin: 0, color: subheadColor, fontSize: width * 0.038, lineHeight: 1.3, fontWeight: 400 }}>
            {subhead}
          </p>
        ) : null}
      </AbsoluteFill>

      {/* Screen first, bezel on top: the bezel's cutout is transparent. */}
      <Img
        src={staticFile(capture)}
        style={{ position: "absolute", ...screen, objectFit: "cover" }}
      />
      <Img src={staticFile("frame.png")} style={{ position: "absolute", ...frame }} />
    </AbsoluteFill>
  );
};
