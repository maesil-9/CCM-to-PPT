import { describe, expect, it } from "vitest";
import { serializeMusicXml, validateMusicXmlAgainstXsd } from "@worship-score/core";
import { buildDemoScore, buildCleanDigitalSample } from "@worship-score/pipeline";

const TIMEOUT = 30_000;

describe("real fixture MusicXML is W3C XSD-valid (MusicXML 4.0)", () => {
  it("demo score (chords shown) validates", async () => {
    const xml = serializeMusicXml(buildDemoScore(), { includeChords: true, systemBreakEvery: 2 });
    const r = await validateMusicXmlAgainstXsd(xml);
    expect(r.ok, r.errors.join("\n")).toBe(true);
  }, TIMEOUT);

  it("clean digital sample validates", async () => {
    const xml = serializeMusicXml(buildCleanDigitalSample(), { includeChords: true });
    const r = await validateMusicXmlAgainstXsd(xml);
    expect(r.ok, r.errors.join("\n")).toBe(true);
  }, TIMEOUT);
});
