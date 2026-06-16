import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESENTATION_PROFILE,
  planPresentation,
  serializeMusicXml,
  type PptxSlideSpec,
} from "@worship-score/core";
import { PptxGenJsBuilder, VerovioRenderer } from "@worship-score/adapters";
import { buildCleanDigitalSample } from "../src/fixtures/cleanDigitalSample.js";

// End-to-end render + build + OOXML validation through the real adapters.
// Verovio loads a WASM toolkit, so allow generous time.
describe("Milestone 1 end-to-end (render → pptx → OOXML)", () => {
  it(
    "renders the first slide and produces a structurally valid PPTX",
    async () => {
      const score = buildCleanDigitalSample();
      const plan = planPresentation(score, DEFAULT_PRESENTATION_PROFILE);
      const slide = plan.slides[0];
      expect(slide).toBeDefined();
      if (!slide) return;

      const xml = serializeMusicXml(score, {
        measureIds: slide.measureIds,
        ...(slide.verse !== undefined ? { verses: [slide.verse] } : {}),
      });

      const renderer = await VerovioRenderer.create();
      const png = await renderer.renderScore({ musicXml: xml, outputMode: "png", options: { scale: 2 } });
      const page = png.pages[0];
      expect(page?.png).toBeDefined();
      expect((page?.widthPx ?? 0) > 0).toBe(true);

      const spec: PptxSlideSpec = {
        index: 0,
        image: { data: page!.png!, mime: "image/png", widthPx: page!.widthPx, heightPx: page!.heightPx },
      };

      const builder = new PptxGenJsBuilder();
      const pptx = await builder.generate({
        metadata: { title: "E2E Test" },
        profile: { slideWidthInches: 13.333, slideHeightInches: 7.5, safeMarginInches: 0.35 },
        slides: [spec],
      });
      expect(pptx.slideCount).toBe(1);
      expect(pptx.buffer.byteLength).toBeGreaterThan(1000);

      const result = await builder.validate({ buffer: pptx.buffer, expectedSlideCount: 1 });
      const failed = result.checks.filter((c) => !c.passed);
      expect(failed, JSON.stringify(failed)).toHaveLength(0);
      expect(result.ok).toBe(true);
    },
    60_000,
  );
});
