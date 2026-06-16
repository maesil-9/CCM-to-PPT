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

  it("injects encoded system breaks every N measures", () => {
    const ms = ["m1", "m2", "m3", "m4"].map((id, i) =>
      measure(id, i, [qn(id, 1, "C", 4), qn(id, 2, "D", 4), qn(id, 3, "E", 4), qn(id, 4, "F", 4)], i === 0),
    );
    const xml = serializeMusicXml(scoreOf(ms), { systemBreakEvery: 2 });
    // breaks before measure 3 (and not before 1 or 2) → exactly one new-system here.
    expect((xml.match(/new-system="yes"/g) ?? []).length).toBe(1);
    expect(xml.indexOf('new-system="yes"')).toBeLessThan(xml.indexOf('<measure number="3">') + 40);
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

  it("emits ornaments inside note notations", () => {
    const note = qn("m1", 1, "C", 4, "whole", { ornaments: ["trill", "mordent"] });
    const xml = serializeMusicXml(scoreOf([measure("m1", 0, [note], true)]));
    expect(xml).toContain("<ornaments>");
    expect(xml).toContain("<trill-mark/>");
    expect(xml).toContain("<mordent/>");
  });

  it("emits a dynamics direction (placement below by default)", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    m.directions = [{ dynamics: "mf" }];
    const xml = serializeMusicXml(scoreOf([m]));
    expect(xml).toContain('<direction placement="below">');
    expect(xml).toContain("<dynamics>");
    expect(xml).toContain("<mf/>");
  });

  it("derives navigation words and the playback sound for D.C. al Fine", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    m.directions = [{ navigation: { jump: "da-capo", target: "fine" } }];
    const xml = serializeMusicXml(scoreOf([m]));
    expect(xml).toContain("<words>D.C. al Fine</words>");
    expect(xml).toContain('<sound dacapo="yes"/>');
  });

  it("emits a segno graphic with its sound marker and an offset", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    m.directions = [{ navigation: { sign: "segno" }, offsetDivisions: 16 }];
    const xml = serializeMusicXml(scoreOf([m]));
    expect(xml).toContain("<segno/>");
    expect(xml).toContain('<sound segno="1"/>');
    expect(xml).toContain("<offset>16</offset>");
  });

  it("derives D.S. al Coda and a coda graphic", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    m.directions = [{ navigation: { jump: "dal-segno", target: "coda" } }, { navigation: { sign: "coda" } }];
    const xml = serializeMusicXml(scoreOf([m]));
    expect(xml).toContain("<words>D.S. al Coda</words>");
    expect(xml).toContain('<sound dalsegno="1"/>');
    expect(xml).toContain("<coda/>");
    expect(xml).toContain('<sound coda="1"/>');
  });

  it("emits a standalone Fine and a bare D.C.", () => {
    const m1 = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    m1.directions = [{ navigation: { fine: true } }];
    expect(serializeMusicXml(scoreOf([m1]))).toContain("<words>Fine</words>");
    expect(serializeMusicXml(scoreOf([m1]))).toContain('<sound fine="yes"/>');

    const m2 = measure("m2", 0, [qn("m2", 1, "C", 4, "whole")], true);
    m2.directions = [{ navigation: { jump: "da-capo" } }];
    const xml2 = serializeMusicXml(scoreOf([m2]));
    expect(xml2).toContain("<words>D.C.</words>");
    expect(xml2).not.toContain("al Fine");
  });

  it("honours an explicit navigation words override", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    m.directions = [{ navigation: { jump: "da-capo", target: "fine", words: "처음으로 (D.C.)" } }];
    const xml = serializeMusicXml(scoreOf([m]));
    expect(xml).toContain("<words>처음으로 (D.C.)</words>");
    expect(xml).not.toContain("D.C. al Fine");
  });

  it("omits an empty direction (no renderable content)", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    m.directions = [{}, { dynamics: "p" }];
    const xml = serializeMusicXml(scoreOf([m]));
    // Exactly one <direction> element (the dynamics); the empty one is dropped.
    // Match `<direction ` / `<direction>` but NOT `<direction-type>`.
    expect((xml.match(/<direction[ >]/g) ?? []).length).toBe(1);
  });

  it("passes non-final bar styles through unchanged", () => {
    const m = measure("m1", 0, [qn("m1", 1, "C", 4, "whole")], true);
    m.barlines = [{ location: "right", style: "light-light" }];
    expect(serializeMusicXml(scoreOf([m]))).toContain("<bar-style>light-light</bar-style>");
  });
});
