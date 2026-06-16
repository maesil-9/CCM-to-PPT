import { describe, expect, it } from "vitest";
import { deriveChordText } from "@worship-score/core";

describe("deriveChordText", () => {
  it("renders common chord qualities", () => {
    expect(deriveChordText({ step: "C" }, "major")).toBe("C");
    expect(deriveChordText({ step: "A" }, "minor")).toBe("Am");
    expect(deriveChordText({ step: "G" }, "dominant")).toBe("G7");
    expect(deriveChordText({ step: "D" }, "minor-seventh")).toBe("Dm7");
    expect(deriveChordText({ step: "C" }, "major-seventh")).toBe("Cmaj7");
    expect(deriveChordText({ step: "E" }, "suspended-fourth")).toBe("Esus4");
  });

  it("renders accidentals and slash basses", () => {
    expect(deriveChordText({ step: "F", alter: 1 }, "major")).toBe("F#");
    expect(deriveChordText({ step: "B", alter: -1 }, "minor")).toBe("Bbm");
    expect(deriveChordText({ step: "C" }, "major", { step: "E" })).toBe("C/E");
    expect(deriveChordText({ step: "G" }, "major", { step: "B" })).toBe("G/B");
  });

  it("falls back to the raw kind for unknown qualities", () => {
    expect(deriveChordText({ step: "C" }, "pedal")).toBe("Cpedal");
  });
});
