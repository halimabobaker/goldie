import React from "react";
import { Video } from "@remotion/media";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { layout } from "./frame";

export type PreviewClip = {
  /** Path under the staging public dir. */
  file: string;
  caption: string;
  durationInFrames: number;
};

export type PreviewProps = {
  clips: PreviewClip[];
  audio?: string;
  background: string;
  captionColor: string;
  fontFamily: string;
  copyHeightRatio: number;
  deviceWidthRatio: number;
};

const FADE = 8;

const Caption: React.FC<{ text: string; color: string; width: number; duration: number }> = ({
  text,
  color,
  width,
  duration,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, FADE, Math.max(duration - FADE, FADE + 1), duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div
      style={{
        opacity,
        color,
        fontSize: width * 0.062,
        fontWeight: 600,
        lineHeight: 1.15,
        textAlign: "center",
        letterSpacing: -width * 0.0012,
      }}
    >
      {text}
    </div>
  );
};

export const Preview: React.FC<PreviewProps> = ({
  clips,
  audio,
  background,
  captionColor,
  fontFamily,
  copyHeightRatio,
  deviceWidthRatio,
}) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const copyHeight = height * copyHeightRatio;
  const { frame: framePos, screen } = layout({ width, height }, deviceWidthRatio, copyHeight, height * 0.03);

  let offset = 0;
  const placed = clips.map((clip) => {
    const from = offset;
    offset += clip.durationInFrames;
    return { ...clip, from };
  });

  return (
    <AbsoluteFill style={{ background, fontFamily }}>
      {placed.map((clip) => (
        <Sequence key={clip.file} from={clip.from} durationInFrames={clip.durationInFrames}>
          <Video src={staticFile(clip.file)} style={{ position: "absolute", ...screen, objectFit: "cover" }} />
          <AbsoluteFill
            style={{
              height: copyHeight,
              padding: `0 ${width * 0.08}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Caption text={clip.caption} color={captionColor} width={width} duration={clip.durationInFrames} />
          </AbsoluteFill>
        </Sequence>
      ))}

      <Img src={staticFile("frame.png")} style={{ position: "absolute", ...framePos }} />

      {/* Apple wants every track enabled; the renderer always writes an AAC
          stream, silent when no bed is configured. */}
      {audio ? <Audio src={staticFile(audio)} volume={0.35} endAt={durationInFrames} /> : null}
    </AbsoluteFill>
  );
};
