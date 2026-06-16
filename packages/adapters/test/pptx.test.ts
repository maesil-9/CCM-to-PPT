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
