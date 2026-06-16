import { describe, expect, it } from "vitest";
import { transposeKey, transposeScore, type HarmonyChord } from "@worship-score/core";
import { measure, qn, scoreOf, validMeasure } from "./_fixtures.js";

describe("transposeKey", () => {
  it("shifts C major up 2 semitones to D major (2 sharps)", () => {
    expect(transposeKey({ fifths: 0, mode: "major" }, 2)).toEqual({ fifths: 2, mode: "major" });
  });

  it("minimizes accidentals via enharmonic spelling", () => {
    expect(transposeKey({ fifths: 0, mode: "major" }, 1).fifths).toBe(-5); // Db (5 flats) over C# (7 sharps)
    expect(transposeKey({ fifths: 0, mode: "major" }, 6).fifths).toBe(-6); // Gb (6 flats) over F# (6 sharps)
  });
});

describe("transposeScore", () => {
  it("returns the same object for 0 semitones", () => {
    const s = scoreOf([validMeasure()]);
    expect(transposeScore(s, 0)).toBe(s);
  });

  it("transposes pitches and key up 2 semitones (C major → D major)", () => {
    const t = transposeScore(scoreOf([validMeasure()]), 2);
    expect(t.musicalContext.initialKey).toEqual({ fifths: 2, mode: "major" });

    const first = t.measures[0]!.events[0]!;
    expect(first.kind).toBe("note");
    if (first.kind === "note") {
      expect(first.pitch.step).toBe("D");
      expect(first.pitch.octave).toBe(4);
      expect(first.pitch.alter ?? 0).toBe(0);
    }

    const third = t.measures[0]!.events[2]!; // E → F#
    if (third.kind === "note") {
      expect(third.pitch.step).toBe("F");
      expect(third.pitch.alter).toBe(1);
    }
  });

  it("transposes chord roots too", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    const harmony: HarmonyChord = { id: "h1", offsetDivisions: 0, root: { step: "C" }, kind: "major" };
    m.harmonies = [harmony];
    const t = transposeScore(scoreOf([m]), 2);
    expect(t.measures[0]!.harmonies![0]!.root).toEqual({ step: "D" });
  });

  it("does not mutate the input score", () => {
    const s = scoreOf([validMeasure()]);
    const before = JSON.stringify(s);
    transposeScore(s, 5);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("spells notes with flats in a flat target key (+1 → Db major)", () => {
    const t = transposeScore(scoreOf([validMeasure()]), 1); // C D E F → Db Eb F Gb
    expect(t.musicalContext.initialKey.fifths).toBe(-5);
    const ev = t.measures[0]!.events;
    if (ev[0]!.kind === "note") {
      expect(ev[0]!.pitch.step).toBe("D");
      expect(ev[0]!.pitch.alter).toBe(-1); // Db, not C#
    }
    if (ev[2]!.kind === "note") {
      expect(ev[2]!.pitch.step).toBe("F"); // E + 1 = F natural
      expect(ev[2]!.pitch.alter ?? 0).toBe(0);
    }
  });
});
