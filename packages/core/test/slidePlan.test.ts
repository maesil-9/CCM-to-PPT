import { describe, expect, it } from "vitest";
import { DEFAULT_PRESENTATION_PROFILE, planPresentation, type ScoreSection } from "@worship-score/core";
import { qn, measure, scoreOf } from "./_fixtures.js";

function fourQuarters(id: string, index: number) {
  return measure(
    id,
    index,
    [qn(id, 1, "C", 4), qn(id, 2, "D", 4), qn(id, 3, "E", 4), qn(id, 4, "F", 4)],
    index === 0,
  );
}

describe("planPresentation", () => {
  const measures = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"].map((id, i) => fourQuarters(id, i));
  const sections: ScoreSection[] = [
    { id: "sec-v", kind: "verse", label: "Verse", startMeasureId: "m1", endMeasureId: "m4" },
    { id: "sec-c", kind: "chorus", label: "Chorus", startMeasureId: "m5", endMeasureId: "m8" },
  ];
  const score = scoreOf(measures, {
    sections,
    presentation: {
      chordVisibility: "hidden",
      order: [
        { id: "p1", sectionId: "sec-v", verse: 1, label: "Verse 1" },
        { id: "p2", sectionId: "sec-c", label: "Chorus" },
      ],
    },
  });

  it("produces one slide per section under the default profile (perSlide=8)", () => {
    const plan = planPresentation(score, DEFAULT_PRESENTATION_PROFILE);
    expect(plan.slides).toHaveLength(2);
  });

  it("packs whole measures and carries verse + labels", () => {
    const plan = planPresentation(score, DEFAULT_PRESENTATION_PROFILE);
    const [first, second] = plan.slides;
    expect(first?.measureIds).toEqual(["m1", "m2", "m3", "m4"]);
    expect(first?.verse).toBe(1);
    expect(first?.title).toBe("Test Title"); // first-slide title only
    expect(first?.sectionLabel).toBe("Verse 1");
    expect(second?.measureIds).toEqual(["m5", "m6", "m7", "m8"]);
    expect(second?.title).toBeUndefined();
    expect(second?.sectionLabel).toBe("Chorus");
  });

  it("auto-labels sections in Korean when metadata.language is ko", () => {
    const koSections: ScoreSection[] = [
      { id: "sec-v", kind: "verse", startMeasureId: "m1", endMeasureId: "m4" },
      { id: "sec-c", kind: "chorus", startMeasureId: "m5", endMeasureId: "m8" },
    ];
    const koScore = scoreOf(measures, {
      metadata: { title: "제목", language: "ko" },
      sections: koSections,
      presentation: {
        chordVisibility: "hidden",
        order: [
          { id: "p1", sectionId: "sec-v", verse: 1 },
          { id: "p2", sectionId: "sec-c" },
        ],
      },
    });
    const plan = planPresentation(koScore, DEFAULT_PRESENTATION_PROFILE);
    expect(plan.slides[0]?.sectionLabel).toBe("1절");
    expect(plan.slides[1]?.sectionLabel).toBe("후렴");
  });

  it("splits a section across slides when it exceeds the per-slide budget", () => {
    const plan = planPresentation(score, { ...DEFAULT_PRESENTATION_PROFILE, measuresPerSystem: 2, maxSystemsPerSlide: 1 });
    // perSlide = 2 → verse(4) -> 2 slides, chorus(4) -> 2 slides
    expect(plan.slides).toHaveLength(4);
    expect(plan.slides[0]?.measureIds).toEqual(["m1", "m2"]);
    expect(plan.slides[1]?.measureIds).toEqual(["m3", "m4"]);
  });
});
