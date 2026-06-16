import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESENTATION_PROFILE,
  parseScoreIr,
  planPresentation,
  serializeMusicXml,
  validateScore,
} from "@worship-score/core";
import { buildCleanDigitalSample } from "../src/fixtures/cleanDigitalSample.js";

describe("clean-digital fixture (Milestone 1 core chain)", () => {
  const score = buildCleanDigitalSample();

  it("passes schema validation", () => {
    expect(() => parseScoreIr(score)).not.toThrow();
  });

  it("has no blocking music-validation issues", () => {
    const result = validateScore(score);
    expect(result.hasBlocking).toBe(false);
    expect(result.issues.filter((i) => i.severity === "error" || i.severity === "fatal")).toHaveLength(0);
  });

  it("serializes MusicXML deterministically", () => {
    expect(serializeMusicXml(score)).toBe(serializeMusicXml(score));
  });

  it("plans 4 slides whose measures are all real measures of the score", () => {
    const plan = planPresentation(score, DEFAULT_PRESENTATION_PROFILE);
    expect(plan.slides).toHaveLength(4);
    const ids = new Set(score.measures.map((m) => m.id));
    for (const slide of plan.slides) {
      expect(slide.measureIds.length).toBeGreaterThan(0);
      for (const id of slide.measureIds) expect(ids.has(id)).toBe(true);
    }
  });

  it("attaches verse 2 lyrics on the third slide (Verse 2)", () => {
    const plan = planPresentation(score, DEFAULT_PRESENTATION_PROFILE);
    expect(plan.slides[2]?.verse).toBe(2);
    const xml = serializeMusicXml(score, { measureIds: plan.slides[2]?.measureIds ?? [], verses: [2] });
    expect(xml).toContain("어"); // verse-2 syllable from the fixture
  });
});
