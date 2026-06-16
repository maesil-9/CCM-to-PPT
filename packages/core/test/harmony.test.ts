import { describe, expect, it } from "vitest";
import { serializeMusicXml, type HarmonyChord } from "@worship-score/core";
import { measure, qn, scoreOf } from "./_fixtures.js";

function scoreWithChord(): ReturnType<typeof scoreOf> {
  const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
  const harmony: HarmonyChord = { id: "h1", offsetDivisions: 0, root: { step: "G" }, kind: "major" };
  m.harmonies = [harmony];
  return scoreOf([m]);
}

describe("MusicXML harmony layer", () => {
  it("hides chords by default", () => {
    expect(serializeMusicXml(scoreWithChord())).not.toContain("<harmony>");
  });

  it("emits harmony when includeChords is set", () => {
    const xml = serializeMusicXml(scoreWithChord(), { includeChords: true });
    expect(xml).toContain("<harmony>");
    expect(xml).toContain("<root-step>G</root-step>");
    // kind carries a derived display text (G major → "G").
    expect(xml).toContain('<kind text="G">major</kind>');
  });

  it("places the chord before the note it aligns with", () => {
    const xml = serializeMusicXml(scoreWithChord(), { includeChords: true });
    expect(xml.indexOf("<harmony>")).toBeLessThan(xml.indexOf("<note>"));
  });

  it("emits a bass note for slash chords", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    m.harmonies = [{ id: "h1", offsetDivisions: 0, root: { step: "C" }, kind: "major", bass: { step: "E" } }];
    const xml = serializeMusicXml(scoreOf([m]), { includeChords: true });
    expect(xml).toContain("<bass-step>E</bass-step>");
  });

  it("emits <offset> for an off-beat chord and omits it on-beat", () => {
    const fourQ = () =>
      measure("m1", 0, [qn("m1", 1, "C", 4), qn("m1", 2, "D", 4), qn("m1", 3, "E", 4), qn("m1", 4, "F", 4)], true);

    // quarter = 8 divisions; offset 4 is mid-first-beat → <offset>4</offset>
    const offBeat = fourQ();
    offBeat.harmonies = [{ id: "h1", offsetDivisions: 4, root: { step: "G" }, kind: "major" }];
    expect(serializeMusicXml(scoreOf([offBeat]), { includeChords: true })).toContain("<offset>4</offset>");

    // offset 8 == onset of the 2nd quarter → no <offset>
    const onBeat = fourQ();
    onBeat.harmonies = [{ id: "h1", offsetDivisions: 8, root: { step: "D" }, kind: "minor" }];
    expect(serializeMusicXml(scoreOf([onBeat]), { includeChords: true })).not.toContain("<offset>");
  });

  it("drops chords whose offset is outside the measure", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true); // capacity 32
    m.harmonies = [{ id: "h1", offsetDivisions: 999, root: { step: "C" }, kind: "major" }];
    expect(serializeMusicXml(scoreOf([m]), { includeChords: true })).not.toContain("<harmony>");
  });
});
