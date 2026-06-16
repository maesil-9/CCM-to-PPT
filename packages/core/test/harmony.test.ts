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
    expect(xml).toContain("<kind>major</kind>");
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
});
