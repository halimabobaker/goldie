import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FONTS, fontFilePath, registerFonts, withGlyphFallback } from "./fonts.ts";

describe("withGlyphFallback", () => {
  test("appends the CJK face so unknown glyphs have somewhere to fall", () => {
    expect(withGlyphFallback("Lato")).toBe(`Lato, "${FONTS["noto-sans-sc"].family}"`);
  });

  test("does not append it twice", () => {
    const once = withGlyphFallback("Lato");
    expect(withGlyphFallback(once)).toBe(once);
  });
});

describe("registerFonts", () => {
  test("registers a config-supplied file under its family", () => {
    // Any real font file will do; reuse a bundled one under a new family name so
    // the assertion cannot pass by way of an already-registered face.
    const family = `GoldieTestFace${Date.now()}`;
    expect(() =>
      registerFonts([{ family, files: { 400: fontFilePath("Lato-400.ttf") } }]),
    ).not.toThrow();
  });

  test("is safe to call repeatedly with the same custom font", () => {
    const family = `GoldieTestRepeat${Date.now()}`;
    const custom = [{ family, files: { 400: fontFilePath("Lato-400.ttf") } }];
    registerFonts(custom);
    expect(() => registerFonts(custom)).not.toThrow();
  });

  test("throws with the offending path when the file is not a font", () => {
    const dir = mkdtempSync(join(tmpdir(), "goldie-fonts-"));
    const bogus = join(dir, "not-a-font.ttf");
    writeFileSync(bogus, "this is not a font");
    expect(() => registerFonts([{ family: "GoldieBogus", files: { 400: bogus } }])).toThrow(bogus);
  });
});
