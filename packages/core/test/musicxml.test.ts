import { describe, expect, it } from "vitest";
import { serializeMusicXml } from "@worship-score/core";
import { measure, qn, scoreOf, validMeasure } from "./_fixtures.js";

describe("serializeMusicXml", () => {
  it("emits a MusicXML 4.0 score-partwise document with attributes", () => {
    const xml = serializeMusicXml(scoreOf([validMeasure()]));
    expect(xml).toContain('<score-partwise version="4.0">');
    expect(xml).toContain("<divisions>8</divisions>");
    expect(xml).toContain("<fifths>0</fifths>");
    expect(xml).toContain("<beats>4</beats>");
    expect(xml).toContain("<beat-type>4</beat-type>");
    expect(xml).toContain("<sign>G</sign>");
    expect(xml).toContain("<step>C</step>");
  });

  it("is deterministic for identical input", () => {
    const score = scoreOf([validMeasure()]);
    expect(serializeMusicXml(score)).toBe(serializeMusicXml(score));
  });

  it("re-emits full attributes on the first measure of a subset", () => {
    const m1 = validMeasure("m1", 0);
    const m2 = measure("m2", 1, [qn("m2", 1, "G", 4), qn("m2", 2, "A", 4), qn("m2", 3, "G", 4), qn("m2", 4, "F", 4)]);
    const xml = serializeMusicXml(scoreOf([m1, m2]), { measureIds: ["m2"] });
    expect(xml).toContain('<measure number="2">');
    // First emitted measure must carry the clef/key/time even though m2 has no change.
    expect(xml).toContain("<divisions>8</divisions>");
    expect(xml).toContain("<sign>G</sign>");
    expect(xml).not.toContain('<measure number="1">');
  });

  it("filters and renumbers lyrics by verse", () => {
    const note = qn("m1", 1, "C", 4, "whole", {
      lyrics: [
        { verse: 1, text: "first", syllabic: "single" },
        { verse: 2, text: "second", syllabic: "single" },
      ],
    });
    const xml = serializeMusicXml(scoreOf([measure("m1", 0, [note], true)]), { verses: [2] });
    expect(xml).toContain("second");
    expect(xml).not.toContain("first");
    expect(xml).toContain('<lyric number="1">');
  });
});
