import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PptxGenJsBuilder, rasterizeSvg } from "@worship-score/adapters";

function png(color: string): Uint8Array {
  return rasterizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="${color}"/></svg>`).data;
}

describe("PptxGenJsBuilder sanitize", () => {
  it("dedups identical media and drops phantom content-type overrides", async () => {
    const score = png("#111111");
    const bg = png("#2244aa");
    const builder = new PptxGenJsBuilder();
    const pptx = await builder.generate({
      metadata: { title: "T" },
      profile: {
        slideWidthInches: 13.333,
        slideHeightInches: 7.5,
        safeMarginInches: 0.35,
        backgroundImage: { data: bg, mime: "image/png" },
        card: { color: "FFFFFF", opacity: 0.8 },
      },
      slides: [
        { index: 0, sectionLabel: "A", image: { data: score, mime: "image/png", widthPx: 40, heightPx: 20 } },
        { index: 1, sectionLabel: "B", image: { data: score, mime: "image/png", widthPx: 40, heightPx: 20 } },
      ],
    });

    const zip = await JSZip.loadAsync(pptx.buffer);
    const files = Object.keys(zip.files);
    const media = files.filter((f) => /^ppt\/media\//.test(f) && !zip.files[f]?.dir);
    expect(media).toHaveLength(2); // 1 score (shared) + 1 background (shared)

    const ct = await zip.file("[Content_Types].xml")!.async("string");
    const phantom = [...ct.matchAll(/<Override PartName="([^"]+)"/g)]
      .map((m) => m[1] ?? "")
      .filter((p) => !files.includes(p.replace(/^\//, "")));
    expect(phantom).toHaveLength(0);

    const result = await builder.validate({ buffer: pptx.buffer, expectedSlideCount: 2 });
    expect(result.ok, JSON.stringify(result.checks.filter((c) => !c.passed))).toBe(true);
  });

  it("produces byte-identical PPTX for identical input (determinism)", async () => {
    const builder = new PptxGenJsBuilder();
    const input = {
      metadata: { title: "D" },
      profile: {
        slideWidthInches: 13.333,
        slideHeightInches: 7.5,
        safeMarginInches: 0.35,
        backgroundImage: { data: png("#223344"), mime: "image/png" as const },
        card: { color: "FFFFFF", opacity: 0.8 },
      },
      slides: [{ index: 0, sectionLabel: "A", image: { data: png("#111111"), mime: "image/png" as const, widthPx: 40, heightPx: 20 } }],
    };
    const a = await builder.generate(input);
    const b = await builder.generate(input);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  });
});

describe("PptxGenJsBuilder font embedding (opt-in)", () => {
  const fontEmbed = {
    family: "Pretendard",
    regular: new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 1, 2, 3, 4]),
    bold: new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 5, 6, 7, 8]),
  };
  const baseInput = {
    metadata: { title: "임베드" },
    profile: { slideWidthInches: 13.333, slideHeightInches: 7.5, safeMarginInches: 0.35 },
    slides: [{ index: 0, title: "찬양", sectionLabel: "1절", image: { data: png("#111111"), mime: "image/png" as const, widthPx: 40, heightPx: 20 } }],
  };

  it("embeds fonts as fntdata parts with valid OPC wiring", async () => {
    const builder = new PptxGenJsBuilder();
    const pptx = await builder.generate({ ...baseInput, fontEmbed });

    const zip = await JSZip.loadAsync(pptx.buffer);
    const files = Object.keys(zip.files);
    expect(files).toContain("ppt/fonts/font1.fntdata");
    expect(files).toContain("ppt/fonts/font2.fntdata");

    const ct = await zip.file("[Content_Types].xml")!.async("string");
    expect(ct).toContain('Extension="fntdata"');

    const rels = await zip.file("ppt/_rels/presentation.xml.rels")!.async("string");
    expect(rels).toContain("relationships/font");
    expect((rels.match(/relationships\/font/g) ?? []).length).toBe(2);

    const pres = await zip.file("ppt/presentation.xml")!.async("string");
    expect(pres).toContain('embedTrueTypeFonts="1"');
    expect(pres).toContain("<p:embeddedFontLst>");
    expect(pres).toContain('<p:font typeface="Pretendard"/>');
    expect(pres).toContain("<p:regular ");
    expect(pres).toContain("<p:bold ");
    // Schema order: embeddedFontLst after notesSz, before defaultTextStyle (if any).
    if (pres.includes("<p:notesSz")) {
      expect(pres.indexOf("embeddedFontLst")).toBeGreaterThan(pres.indexOf("<p:notesSz"));
    }
    if (pres.includes("<p:defaultTextStyle")) {
      expect(pres.indexOf("embeddedFontLst")).toBeLessThan(pres.indexOf("<p:defaultTextStyle"));
    }

    const result = await builder.validate({ buffer: pptx.buffer, expectedSlideCount: 1 });
    expect(result.ok, JSON.stringify(result.checks.filter((c) => !c.passed))).toBe(true);
  });

  it("is byte-deterministic with embedding, and larger than without", async () => {
    const builder = new PptxGenJsBuilder();
    const withEmbed1 = await builder.generate({ ...baseInput, fontEmbed });
    const withEmbed2 = await builder.generate({ ...baseInput, fontEmbed });
    const without = await builder.generate(baseInput);
    expect(Buffer.from(withEmbed1.buffer).equals(Buffer.from(withEmbed2.buffer))).toBe(true);
    expect(withEmbed1.buffer.length).toBeGreaterThan(without.buffer.length);
  });
});
