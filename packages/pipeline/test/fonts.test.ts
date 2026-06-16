import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDLED_FONT_FAMILY, bundledFontFiles, defaultFontConfig } from "@worship-score/pipeline";

describe("bundled fonts", () => {
  it("ships the Pretendard Regular + Bold OTF assets", () => {
    const files = bundledFontFiles();
    expect(files.length).toBe(2);
    for (const f of files) {
      expect(existsSync(f)).toBe(true);
      expect(/Pretendard-(Regular|Bold)\.otf$/.test(f)).toBe(true);
    }
  });

  it("defaultFontConfig pins the bundled family and files (no system-font dependency)", () => {
    const cfg = defaultFontConfig();
    expect(cfg.textFontFamily).toBe(BUNDLED_FONT_FAMILY);
    expect(cfg.fontFiles?.length).toBe(2);
  });
});
