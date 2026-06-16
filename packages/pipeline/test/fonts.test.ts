import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_FONT_FAMILY,
  bundledFontFiles,
  defaultFontConfig,
  fontEmbedFromConfig,
} from "@worship-score/pipeline";

describe("bundled fonts", () => {
  it("ships the Pretendard text fonts and the Bravura music font", () => {
    const files = bundledFontFiles();
    expect(files.length).toBe(3);
    for (const f of files) expect(existsSync(f)).toBe(true);
    expect(files.some((f) => /Pretendard-Regular\.otf$/.test(f))).toBe(true);
    expect(files.some((f) => /Pretendard-Bold\.otf$/.test(f))).toBe(true);
    expect(files.some((f) => /Bravura\.otf$/.test(f))).toBe(true);
  });

  it("defaultFontConfig pins the text family and loads text + music fonts", () => {
    const cfg = defaultFontConfig();
    expect(cfg.textFontFamily).toBe(BUNDLED_FONT_FAMILY);
    expect(cfg.fontFiles?.length).toBe(3);
  });

  it("fontEmbedFromConfig resolves Regular + Bold from the bundled family by filename", () => {
    const embed = fontEmbedFromConfig(defaultFontConfig());
    expect(embed?.family).toBe(BUNDLED_FONT_FAMILY);
    expect(embed?.regular?.length ?? 0).toBeGreaterThan(1000);
    expect(embed?.bold?.length ?? 0).toBeGreaterThan(1000);
    // The two weights must be distinct files, not the same bytes.
    expect(Buffer.from(embed!.regular).equals(Buffer.from(embed!.bold!))).toBe(false);
  });

  it("fontEmbedFromConfig returns a single weight when only one file is given", () => {
    const regularOnly = bundledFontFiles().filter((f) => /Regular/.test(f));
    const embed = fontEmbedFromConfig({ textFontFamily: "Pretendard", fontFiles: regularOnly });
    expect(embed?.regular?.length ?? 0).toBeGreaterThan(1000);
    expect(embed?.bold).toBeUndefined();
  });

  it("fontEmbedFromConfig is undefined without a family or files", () => {
    expect(fontEmbedFromConfig({ fontFiles: bundledFontFiles() })).toBeUndefined();
    expect(fontEmbedFromConfig({ textFontFamily: "X", fontFiles: [] })).toBeUndefined();
  });
});
