import { describe, expect, it } from "vitest";
import { serializeMusicXml, validateScore, type Measure } from "@worship-score/core";
import { qn, scoreOf } from "./_fixtures.js";

function contextOf(beats: number, beatType: number, fifths = 0) {
  return {
    musicalContext: {
      divisions: 8,
      initialKey: { fifths, mode: "major" as const },
      initialTime: { beats, beatType },
      initialClef: { sign: "G" as const, line: 2 },
    },
  };
}

describe("meter coverage (MVP scope: 3/4, 6/8, pickup, dotted)", () => {
  it("accepts a full 3/4 measure (three quarters = 24)", () => {
    const m: Measure = {
      id: "m1",
      number: 1,
      index: 0,
      attributes: { divisions: 8, key: { fifths: 0, mode: "major" }, time: { beats: 3, beatType: 4 }, clef: { sign: "G", line: 2 } },
      events: [qn("m1", 1, "G", 4), qn("m1", 2, "A", 4), qn("m1", 3, "B", 4)],
    };
    expect(validateScore(scoreOf([m], contextOf(3, 4))).hasBlocking).toBe(false);
    expect(serializeMusicXml(scoreOf([m], contextOf(3, 4)))).toContain("<beats>3</beats>");
  });

  it("accepts a 6/8 measure (six eighths = 24)", () => {
    const events = ["C", "D", "E", "F", "G", "A"].map((s, i) => qn("m1", i + 1, s as "C", 4, "eighth"));
    const m: Measure = {
      id: "m1",
      number: 1,
      index: 0,
      attributes: { divisions: 8, key: { fifths: 0, mode: "major" }, time: { beats: 6, beatType: 8 }, clef: { sign: "G", line: 2 } },
      events,
    };
    const score = scoreOf([m], contextOf(6, 8));
    expect(validateScore(score).hasBlocking).toBe(false);
    const xml = serializeMusicXml(score);
    expect(xml).toContain("<beats>6</beats>");
    expect(xml).toContain("<beat-type>8</beat-type>");
  });

  it("allows a pickup (anacrusis) measure shorter than the bar", () => {
    const pickup: Measure = {
      id: "m0",
      number: 0,
      index: 0,
      pickup: true,
      attributes: { divisions: 8, key: { fifths: 0, mode: "major" }, time: { beats: 3, beatType: 4 }, clef: { sign: "G", line: 2 } },
      events: [qn("m0", 1, "D", 4)], // single quarter (8) < 24
    };
    const full: Measure = {
      id: "m1",
      number: 1,
      index: 1,
      events: [qn("m1", 1, "G", 4), qn("m1", 2, "A", 4), qn("m1", 3, "B", 4)],
    };
    expect(validateScore(scoreOf([pickup, full], contextOf(3, 4))).hasBlocking).toBe(false);
  });

  it("accepts dotted rhythms that sum correctly (two dotted quarters in 3/4 = 24)", () => {
    const m: Measure = {
      id: "m1",
      number: 1,
      index: 0,
      attributes: { divisions: 8, key: { fifths: 0, mode: "major" }, time: { beats: 3, beatType: 4 }, clef: { sign: "G", line: 2 } },
      events: [
        { id: "m1-n1", kind: "note", measureId: "m1", voice: 1, staff: 1, pitch: { step: "G", octave: 4 }, duration: { type: "quarter", dots: 1 } },
        { id: "m1-n2", kind: "note", measureId: "m1", voice: 1, staff: 1, pitch: { step: "B", octave: 4 }, duration: { type: "quarter", dots: 1 } },
      ],
    };
    const score = scoreOf([m], contextOf(3, 4));
    expect(validateScore(score).hasBlocking).toBe(false);
    expect(serializeMusicXml(score)).toContain("<dot/>");
  });

  it("flags an underfilled non-pickup measure", () => {
    const m: Measure = {
      id: "m1",
      number: 1,
      index: 0,
      attributes: { divisions: 8, key: { fifths: 0, mode: "major" }, time: { beats: 3, beatType: 4 }, clef: { sign: "G", line: 2 } },
      events: [qn("m1", 1, "G", 4), qn("m1", 2, "A", 4)], // 16 != 24
    };
    expect(validateScore(scoreOf([m], contextOf(3, 4))).hasBlocking).toBe(true);
  });
});
