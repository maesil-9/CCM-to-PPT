import { describe, expect, it } from "vitest";
import {
  eventDurationDivisions,
  parseScoreIr,
  serializeMusicXml,
  validateScore,
  SCOREIR_SCHEMA_VERSION,
  type Measure,
  type Note,
  type ScoreIR,
} from "@worship-score/core";

function tripletNote(i: number, step: "C" | "D" | "E", extra: Partial<Note> = {}): Note {
  return {
    id: `m1-n${i}`,
    kind: "note",
    measureId: "m1",
    voice: 1,
    staff: 1,
    pitch: { step, octave: 4 },
    duration: { type: "eighth", dots: 0, timeModification: { actualNotes: 3, normalNotes: 2 } },
    ...extra,
  };
}

/** 2/4 at divisions=24: an eighth-note triplet (24) + a quarter with fermata (24). */
function tripletScore(): ScoreIR {
  const measure: Measure = {
    id: "m1",
    number: 1,
    index: 0,
    attributes: { divisions: 24, key: { fifths: 0, mode: "major" }, time: { beats: 2, beatType: 4 }, clef: { sign: "G", line: 2 } },
    events: [
      tripletNote(1, "C", { tuplet: { start: true, stop: false } }),
      tripletNote(2, "D"),
      tripletNote(3, "E", { tuplet: { start: false, stop: true } }),
      { id: "m1-n4", kind: "note", measureId: "m1", voice: 1, staff: 1, pitch: { step: "G", octave: 4 }, duration: { type: "quarter", dots: 0 }, fermata: true },
    ],
  };
  return {
    scoreId: "triplet-test",
    schemaVersion: SCOREIR_SCHEMA_VERSION,
    metadata: {},
    musicalContext: { divisions: 24, initialKey: { fifths: 0, mode: "major" }, initialTime: { beats: 2, beatType: 4 }, initialClef: { sign: "G", line: 2 }, tempoBpm: 96 },
    parts: [{ id: "P1", name: "Melody", staffCount: 1 }],
    measures: [measure],
    sections: [],
    sourceRegions: [],
    uncertainties: [],
    presentation: { chordVisibility: "hidden", order: [] },
  };
}

describe("tuplets / fermata / tempo", () => {
  it("scales triplet durations to integers at divisions=24", () => {
    expect(eventDurationDivisions({ type: "eighth", dots: 0, timeModification: { actualNotes: 3, normalNotes: 2 } }, 24)).toBe(8);
  });

  it("throws (with guidance) when a tuplet is not integer-representable", () => {
    expect(() => eventDurationDivisions({ type: "eighth", dots: 0, timeModification: { actualNotes: 3, normalNotes: 2 } }, 8)).toThrow(/divisions/);
  });

  it("validates a 2/4 measure of a triplet + a quarter (sum = capacity)", () => {
    const score = tripletScore();
    expect(() => parseScoreIr(score)).not.toThrow();
    expect(validateScore(score).hasBlocking).toBe(false);
  });

  it("serializes time-modification, tuplet brackets, fermata, and tempo", () => {
    const xml = serializeMusicXml(tripletScore());
    expect(xml).toContain("<actual-notes>3</actual-notes>");
    expect(xml).toContain("<normal-notes>2</normal-notes>");
    expect(xml).toContain('<tuplet type="start" number="1"/>');
    expect(xml).toContain('<tuplet type="stop" number="1"/>');
    expect(xml).toContain("<fermata/>");
    expect(xml).toContain('<sound tempo="96"/>');
    expect(xml).toContain("<per-minute>96</per-minute>");
  });
});
