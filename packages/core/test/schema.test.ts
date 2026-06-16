import { describe, expect, it } from "vitest";
import { parseScoreIr, safeParseScoreIr } from "@worship-score/core";
import { scoreOf, validMeasure } from "./_fixtures.js";

describe("ScoreIR schema", () => {
  it("parses a structurally valid score", () => {
    const score = scoreOf([validMeasure()]);
    expect(() => parseScoreIr(score)).not.toThrow();
  });

  it("preserves all data through parse (deep equality, key order aside)", () => {
    const score = scoreOf([validMeasure()]);
    const parsed = parseScoreIr(score);
    expect(parsed).toEqual(score);
  });

  it("rejects an invalid score (bad alter range)", () => {
    const bad = scoreOf([validMeasure()]) as unknown as Record<string, unknown>;
    const measures = bad["measures"] as Array<{ events: Array<{ pitch?: { alter?: number } }> }>;
    const firstEvent = measures[0]?.events[0];
    if (firstEvent?.pitch) firstEvent.pitch.alter = 5; // out of -2..2
    expect(safeParseScoreIr(bad).success).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(safeParseScoreIr(null).success).toBe(false);
    expect(safeParseScoreIr("nope").success).toBe(false);
  });
});
