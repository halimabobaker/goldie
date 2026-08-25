/**
 * Geometry of the bezel PNGs in assets/ (the 17-pro-* variants): the bezel
 * image and the transparent screen cutout inside it, both in the source PNG's
 * own pixels. All bundled variants share this geometry. Measured from the
 * alpha channel; re-measure if custom bezel art is used instead.
 */
export const FRAME = {
  width: 606,
  height: 1252,
  screen: { x: 24, y: 21, width: 557, height: 1210 },
  /**
   * Corner radius of the screen cutout. The bezel ring is thinner than this
   * radius, so square screen content would poke past the phone's outer corner;
   * the compositor clips the content with the scaled radius instead.
   */
  screenRadius: 82,
} as const;

/**
 * Place the bezel inside a `canvas`-sized composition: as wide as `widthRatio`
 * allows, but scaled down if that would push it past the bottom margin, and
 * centred in the space left below the copy area.
 */
export function layout(
  canvas: { width: number; height: number },
  widthRatio: number,
  copyHeight: number,
  bottomMargin = 0,
) {
  const available = canvas.height - copyHeight - bottomMargin;
  const scale = Math.min((canvas.width * widthRatio) / FRAME.width, available / FRAME.height);
  const width = FRAME.width * scale;
  const height = FRAME.height * scale;
  const left = (canvas.width - width) / 2;
  const top = copyHeight + (available - height) / 2;

  return {
    frame: { left, top, width, height },
    screen: {
      left: left + FRAME.screen.x * scale,
      top: top + FRAME.screen.y * scale,
      width: FRAME.screen.width * scale,
      height: FRAME.screen.height * scale,
      borderRadius: FRAME.screenRadius * scale,
    },
  };
}
