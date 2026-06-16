import { describe, expect, it } from "vitest";
import { buildDemoScore, buildPresentation } from "@worship-score/pipeline";
import { rasterizeSvg } from "@worship-score/adapters";

const TINY_BG = rasterizeSvg(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="#1b2440"/></svg>',
);

describe("buildPresentation (chords + transpose + background)", () => {
  it(
    "builds the demo with chords shown, transposed +2, over a background — valid PPTX",
    async () => {
      const result = await buildPresentation({
        score: buildDemoScore(),
        options: {
          chords: { visible: true },
          key: { transposeSemitones: 2 },
          background: { data: TINY_BG.data, mime: "image/png", scrim: 0.8 },
        },
      });

      expect(result.scoreValidation.hasBlocking).toBe(false);
      expect(result.pptx.slideCount).toBe(4);
      expect(result.validation.ok).toBe(true);
      // transposed C major -> D major
      expect(result.resolvedScore.musicalContext.initialKey.fifths).toBe(2);
      // chords present in MusicXML
      expect(result.musicXml).toContain("<harmony>");
    },
    60_000,
  );

  it(
    "hides chords and keeps original key when options are default",
    async () => {
      const result = await buildPresentation({ score: buildDemoScore() });
      expect(result.resolvedScore.musicalContext.initialKey.fifths).toBe(0);
      expect(result.musicXml).not.toContain("<harmony>");
      expect(result.validation.ok).toBe(true);
    },
    60_000,
  );
});
