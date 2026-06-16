/**
 * Demo score = the clean synthetic melody fixture + a chord-symbol layer, used
 * to exercise the optional chords/key/background features end-to-end. Still
 * rights-clear (original synthetic data).
 */
import type { HarmonyChord, ScoreIR, StepName } from "@worship-score/core";
import { buildCleanDigitalSample } from "./cleanDigitalSample.js";

interface ChordSpec {
  off: number;
  step: StepName;
  alter?: number;
  kind?: string;
}

// Simple I–IV–V harmonization in C major (two chords per measure, beats 1 & 3).
const CHORD_PLAN: Record<string, ChordSpec[]> = {
  m1: [{ off: 0, step: "C" }, { off: 16, step: "C" }],
  m2: [{ off: 0, step: "F" }, { off: 16, step: "F" }],
  m3: [{ off: 0, step: "G" }, { off: 16, step: "G" }],
  m4: [{ off: 0, step: "C" }, { off: 16, step: "G" }],
  m5: [{ off: 0, step: "C" }, { off: 16, step: "C" }],
  m6: [{ off: 0, step: "F" }, { off: 16, step: "C" }],
  m7: [{ off: 0, step: "G" }, { off: 16, step: "G" }],
  m8: [{ off: 0, step: "C" }],
};

export function buildDemoScore(): ScoreIR {
  const base = buildCleanDigitalSample();
  base.scoreId = "fixture-demo-001";
  base.metadata = { ...base.metadata, title: "샘플 찬양 (코드·배경 데모)" };

  base.measures = base.measures.map((m) => {
    const specs = CHORD_PLAN[m.id];
    if (!specs) return m;
    const harmonies: HarmonyChord[] = specs.map((s, i) => ({
      id: `${m.id}-h${i + 1}`,
      offsetDivisions: s.off,
      root: s.alter !== undefined ? { step: s.step, alter: s.alter } : { step: s.step },
      kind: s.kind ?? "major",
    }));
    return { ...m, harmonies };
  });

  return base;
}
