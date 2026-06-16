import { describe, expect, it } from "vitest";
import { DEFAULT_DIVISIONS, eventDurationDivisions, measureDurationDivisions } from "@worship-score/core";

describe("eventDurationDivisions", () => {
  it("maps note types to division units at divisions=8", () => {
    const d = DEFAULT_DIVISIONS;
    expect(eventDurationDivisions({ type: "whole", dots: 0 }, d)).toBe(32);
    expect(eventDurationDivisions({ type: "half", dots: 0 }, d)).toBe(16);
    expect(eventDurationDivisions({ type: "quarter", dots: 0 }, d)).toBe(8);
    expect(eventDurationDivisions({ type: "eighth", dots: 0 }, d)).toBe(4);
    expect(eventDurationDivisions({ type: "16th", dots: 0 }, d)).toBe(2);
  });

  it("applies augmentation dots", () => {
    const d = DEFAULT_DIVISIONS;
    expect(eventDurationDivisions({ type: "quarter", dots: 1 }, d)).toBe(12);
    expect(eventDurationDivisions({ type: "eighth", dots: 1 }, d)).toBe(6);
    expect(eventDurationDivisions({ type: "half", dots: 1 }, d)).toBe(24);
  });

  it("throws on non-integer subdivisions", () => {
    expect(() => eventDurationDivisions({ type: "16th", dots: 1 }, 2)).toThrow();
  });
});

describe("measureDurationDivisions", () => {
  it("computes capacity for common signatures at divisions=8", () => {
    const d = DEFAULT_DIVISIONS;
    expect(measureDurationDivisions({ beats: 4, beatType: 4 }, d)).toBe(32);
    expect(measureDurationDivisions({ beats: 3, beatType: 4 }, d)).toBe(24);
    expect(measureDurationDivisions({ beats: 6, beatType: 8 }, d)).toBe(24);
  });
});
