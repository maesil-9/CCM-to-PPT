import { describe, expect, it } from "vitest";
import { validateScore } from "@worship-score/core";
import { measure, qn, scoreOf, validMeasure } from "./_fixtures.js";

function codes(score: ReturnType<typeof scoreOf>) {
  return new Set(validateScore(score).issues.map((i) => i.code));
}

describe("validateScore", () => {
  it("accepts a clean single measure with no blocking issues", () => {
    const result = validateScore(scoreOf([validMeasure()]));
    expect(result.hasBlocking).toBe(false);
    expect(result.ok).toBe(true);
  });

  it("flags MEASURE_DURATION_MATCH when a 4/4 measure is underfilled", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4), qn("m1", 2, "D", 4), qn("m1", 3, "E", 4)], true);
    const result = validateScore(scoreOf([m]));
    expect(result.hasBlocking).toBe(true);
    expect(codes(scoreOf([m]))).toContain("MEASURE_DURATION_MATCH");
  });

  it("flags TIE_TARGET_EXISTS for an unterminated tie", () => {
    const m = measure(
      "m1",
      0,
      [
        qn("m1", 1, "C", 4),
        qn("m1", 2, "D", 4),
        qn("m1", 3, "E", 4),
        qn("m1", 4, "F", 4, "quarter", { tie: { start: true, stop: false } }),
      ],
      true,
    );
    expect(codes(scoreOf([m]))).toContain("TIE_TARGET_EXISTS");
  });

  it("flags TIE_PITCH_MATCH when tied notes differ in pitch", () => {
    const m = measure(
      "m1",
      0,
      [
        qn("m1", 1, "C", 4, "half", { tie: { start: true, stop: false } }),
        qn("m1", 2, "D", 4, "half", { tie: { start: false, stop: true } }),
      ],
      true,
    );
    expect(codes(scoreOf([m]))).toContain("TIE_PITCH_MATCH");
  });

  it("flags DANGLING_SOURCE_REGION for a missing region reference", () => {
    const m = measure(
      "m1",
      0,
      [
        qn("m1", 1, "C", 4, "whole", { sourceRegionId: "missing-region" }),
      ],
      true,
    );
    const result = validateScore(scoreOf([m]));
    expect(result.hasBlocking).toBe(true);
    expect(codes(scoreOf([m]))).toContain("DANGLING_SOURCE_REGION");
  });

  it("warns (non-blocking) on out-of-range pitch", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 9, "whole")], true);
    const result = validateScore(scoreOf([m]));
    expect(result.issues.some((i) => i.code === "PITCH_RANGE_REASONABLE" && i.severity === "warning")).toBe(true);
    expect(result.hasBlocking).toBe(false);
  });

  it("flags HARMONY_OFFSET_IN_RANGE when a chord offset is outside the measure", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true); // capacity 32
    m.harmonies = [{ id: "h1", offsetDivisions: 999, root: { step: "C" }, kind: "major" }];
    const result = validateScore(scoreOf([m]));
    expect(result.hasBlocking).toBe(true);
    expect(codes(scoreOf([m]))).toContain("HARMONY_OFFSET_IN_RANGE");
  });

  it("accepts an in-range chord offset", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    m.harmonies = [{ id: "h1", offsetDivisions: 16, root: { step: "G" }, kind: "major" }];
    expect(validateScore(scoreOf([m])).hasBlocking).toBe(false);
  });

  it("flags DUPLICATE_ID across measures/events", () => {
    const a = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    const b = measure("m1", 1, [qn("dup", 1, "D", 4, "whole")], false); // duplicate measure id
    const result = validateScore(scoreOf([a, b]));
    expect(result.hasBlocking).toBe(true);
    expect(codes(scoreOf([a, b]))).toContain("DUPLICATE_ID");
  });

  it("flags SECTION_MEASURE_REF_VALID for a dangling section reference", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    const score = scoreOf([m], {
      sections: [{ id: "s1", kind: "verse", label: "V", startMeasureId: "m1", endMeasureId: "nope" }],
    });
    expect(validateScore(score).hasBlocking).toBe(true);
    expect(new Set(validateScore(score).issues.map((i) => i.code))).toContain("SECTION_MEASURE_REF_VALID");
  });

  it("flags PRESENTATION_SECTION_REF_VALID for an unknown section in the running order", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    const score = scoreOf([m], {
      sections: [{ id: "s1", kind: "verse", label: "V", startMeasureId: "m1", endMeasureId: "m1" }],
      presentation: { chordVisibility: "hidden", order: [{ id: "p1", sectionId: "ghost" }] },
    });
    expect(new Set(validateScore(score).issues.map((i) => i.code))).toContain("PRESENTATION_SECTION_REF_VALID");
  });
});
