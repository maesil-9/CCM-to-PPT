import { describe, expect, it } from "vitest";
import { serializeMusicXml, validateMusicXmlAgainstXsd, type Measure } from "@worship-score/core";
import { measure, qn, scoreOf, validMeasure } from "./_fixtures.js";

// First call compiles the 380KB MusicXML 4.0 schema; give the suite headroom.
const TIMEOUT = 30_000;

/** A 4/4 measure exercising directions, ornaments, fermata, harmony, barlines. */
function featureMeasure(): Measure {
  const m = measure(
    "m1",
    0,
    [
      qn("m1", 1, "C", 4, "quarter", { ornaments: ["trill"], lyrics: [{ verse: 1, text: "주", syllabic: "single" }] }),
      qn("m1", 2, "D", 4, "quarter", { ornaments: ["mordent"] }),
      qn("m1", 3, "E", 4, "quarter", { slur: { start: true, stop: false } }),
      qn("m1", 4, "F", 4, "quarter", { slur: { start: false, stop: true }, fermata: true }),
    ],
    true,
  );
  m.directions = [
    { dynamics: "mf" },
    { navigation: { sign: "segno" } },
    { navigation: { jump: "da-capo", target: "fine" } },
  ];
  m.harmonies = [{ id: "h1", offsetDivisions: 0, root: { step: "C" }, kind: "major" }];
  m.barlines = [{ location: "right", style: "final" }];
  return m;
}

/** A triplet measure (divisions 24, time-modification + tuplet brackets). */
function tripletScore() {
  const trip = (i: number, step: "C" | "D" | "E", start: boolean, stop: boolean) => ({
    id: `m1-n${i}`,
    kind: "note" as const,
    measureId: "m1",
    voice: 1,
    staff: 1,
    pitch: { step, octave: 4 },
    duration: { type: "eighth" as const, dots: 0, timeModification: { actualNotes: 3, normalNotes: 2 } },
    tuplet: { start, stop },
  });
  const m: Measure = {
    id: "m1",
    number: 1,
    index: 0,
    attributes: { divisions: 24, key: { fifths: 0, mode: "major" }, time: { beats: 1, beatType: 4 }, clef: { sign: "G", line: 2 } },
    events: [trip(1, "C", true, false), trip(2, "D", false, false), trip(3, "E", false, true)],
  };
  return scoreOf([m], { musicalContext: { divisions: 24, initialKey: { fifths: 0, mode: "major" }, initialTime: { beats: 1, beatType: 4 }, initialClef: { sign: "G", line: 2 } } });
}

describe("MusicXML W3C XSD validation (MusicXML 4.0)", () => {
  it("validates a clean single measure", async () => {
    const xml = serializeMusicXml(scoreOf([validMeasure()]));
    const r = await validateMusicXmlAgainstXsd(xml);
    expect(r.ok, r.errors.join("\n")).toBe(true);
  }, TIMEOUT);

  it("validates dynamics / ornaments / navigation / fermata / chords / barlines", async () => {
    const xml = serializeMusicXml(scoreOf([featureMeasure()]), { includeChords: true });
    const r = await validateMusicXmlAgainstXsd(xml);
    expect(r.ok, r.errors.join("\n")).toBe(true);
  }, TIMEOUT);

  it("validates triplets (time-modification + tuplet)", async () => {
    const xml = serializeMusicXml(tripletScore());
    const r = await validateMusicXmlAgainstXsd(xml);
    expect(r.ok, r.errors.join("\n")).toBe(true);
  }, TIMEOUT);

  it("validates a multi-measure subset with an encoded system break", async () => {
    const ms = ["m1", "m2", "m3"].map((id, i) =>
      measure(id, i, [qn(id, 1, "C", 4), qn(id, 2, "D", 4), qn(id, 3, "E", 4), qn(id, 4, "F", 4)], i === 0),
    );
    const xml = serializeMusicXml(scoreOf(ms), { systemBreakEvery: 2 });
    const r = await validateMusicXmlAgainstXsd(xml);
    expect(r.ok, r.errors.join("\n")).toBe(true);
  }, TIMEOUT);

  it("rejects structurally invalid MusicXML", async () => {
    const bad = '<?xml version="1.0"?><score-partwise version="4.0"><nonsense/></score-partwise>';
    const r = await validateMusicXmlAgainstXsd(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  }, TIMEOUT);

  it("rejects an enum-facet violation (bad clef sign), not just bad structure", async () => {
    // Inject an invalid clef <sign>Z</sign> (clef-sign is an XSD enumeration:
    // G/F/C/percussion/TAB/jianpu/none) — exercises XSD facet checking, not just
    // element structure.
    const xml = serializeMusicXml(scoreOf([validMeasure()])).replace(
      /<sign>G<\/sign>/,
      "<sign>Z</sign>",
    );
    const r = await validateMusicXmlAgainstXsd(xml);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/sign|enumeration|facet|'Z'/i);
  }, TIMEOUT);
});
