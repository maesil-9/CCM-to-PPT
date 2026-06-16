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
});
