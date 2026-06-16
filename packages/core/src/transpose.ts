/**
 * Chromatic transposition (PRD: 키는 선택 옵션; 전조는 후속 범위지만 사용자 옵션으로 제공).
 *
 * Deterministic and pure: returns a new ScoreIR with all melody pitches, key
 * signatures, and chord roots shifted by `semitones`. Spelling (sharp vs flat)
 * follows the transposed key's preference. Single-key MVP: preference is taken
 * from the initial key.
 */
import type {
  HarmonyChord,
  Key,
  Note,
  RootStep,
  ScoreIR,
  StepName,
} from "./types/scoreir.js";

const STEP_SEMITONE: Record<StepName, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

interface Spelling {
  step: StepName;
  alter: number;
}

const SHARP_SPELLING: Spelling[] = [
  { step: "C", alter: 0 },
  { step: "C", alter: 1 },
  { step: "D", alter: 0 },
  { step: "D", alter: 1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "F", alter: 1 },
  { step: "G", alter: 0 },
  { step: "G", alter: 1 },
  { step: "A", alter: 0 },
  { step: "A", alter: 1 },
  { step: "B", alter: 0 },
];

const FLAT_SPELLING: Spelling[] = [
  { step: "C", alter: 0 },
  { step: "D", alter: -1 },
  { step: "D", alter: 0 },
  { step: "E", alter: -1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "G", alter: -1 },
  { step: "G", alter: 0 },
  { step: "A", alter: -1 },
  { step: "A", alter: 0 },
  { step: "B", alter: -1 },
  { step: "B", alter: 0 },
];

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function normalizeFifths(fifths: number): number {
  let f = fifths;
  while (f > 7) f -= 12;
  while (f < -7) f += 12;
  return f;
}

/** Transposing up one semitone moves +7 around the circle of fifths. */
export function transposeKey(key: Key, semitones: number): Key {
  return { fifths: normalizeFifths(key.fifths + semitones * 7), mode: key.mode };
}

function spellingTable(fifths: number): Spelling[] {
  return fifths >= 0 ? SHARP_SPELLING : FLAT_SPELLING;
}

function spellPitch(midi: number, table: Spelling[]): { step: StepName; alter: number; octave: number } {
  const pc = mod12(midi);
  const sp = table[pc]!;
  const octave = Math.round((midi - STEP_SEMITONE[sp.step] - sp.alter) / 12) - 1;
  return { step: sp.step, alter: sp.alter, octave };
}

function transposeNote(note: Note, semitones: number, table: Spelling[]): Note {
  const midi =
    (note.pitch.octave + 1) * 12 + STEP_SEMITONE[note.pitch.step] + (note.pitch.alter ?? 0) + semitones;
  const sp = spellPitch(midi, table);
  return {
    ...note,
    pitch: sp.alter === 0 ? { step: sp.step, octave: sp.octave } : { step: sp.step, alter: sp.alter, octave: sp.octave },
  };
}

function transposeRoot(root: RootStep, semitones: number, table: Spelling[]): RootStep {
  const pc = mod12(STEP_SEMITONE[root.step] + (root.alter ?? 0) + semitones);
  const sp = table[pc]!;
  return sp.alter === 0 ? { step: sp.step } : { step: sp.step, alter: sp.alter };
}

function transposeHarmony(h: HarmonyChord, semitones: number, table: Spelling[]): HarmonyChord {
  const next: HarmonyChord = { ...h, root: transposeRoot(h.root, semitones, table) };
  if (h.bass) next.bass = transposeRoot(h.bass, semitones, table);
  // Drop any cached display text; it is re-derived from the transposed root.
  delete next.text;
  return next;
}

export function transposeScore(score: ScoreIR, semitones: number): ScoreIR {
  if (semitones === 0) return score;
  const newInitialKey = transposeKey(score.musicalContext.initialKey, semitones);
  const table = spellingTable(newInitialKey.fifths);

  const measures = score.measures.map((m) => {
    const next = {
      ...m,
      events: m.events.map((ev) => (ev.kind === "note" ? transposeNote(ev, semitones, table) : ev)),
    };
    if (m.attributes?.key) {
      next.attributes = { ...m.attributes, key: transposeKey(m.attributes.key, semitones) };
    }
    if (m.harmonies) {
      next.harmonies = m.harmonies.map((h) => transposeHarmony(h, semitones, table));
    }
    return next;
  });

  return {
    ...score,
    musicalContext: { ...score.musicalContext, initialKey: newInitialKey },
    measures,
  };
}
