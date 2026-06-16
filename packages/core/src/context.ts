/**
 * Resolves the active musical attributes (divisions, key, time, clef) in effect
 * at each measure by walking the score from the initial context and applying
 * attribute changes in order. Shared by validation and MusicXML serialization
 * so both agree on what is "in effect" at any measure.
 */
import type { Clef, Key, ScoreIR, Time } from "./types/scoreir.js";

export interface ActiveAttributes {
  divisions: number;
  key: Key;
  time: Time;
  clef: Clef;
}

/** Returns measures sorted by absolute order index (ascending). */
export function orderedMeasures(score: ScoreIR) {
  return [...score.measures].sort((a, b) => a.index - b.index);
}

export function computeActiveAttributes(
  score: ScoreIR,
): Map<string, ActiveAttributes> {
  let divisions = score.musicalContext.divisions;
  let key = score.musicalContext.initialKey;
  let time = score.musicalContext.initialTime;
  let clef = score.musicalContext.initialClef;

  const map = new Map<string, ActiveAttributes>();
  for (const m of orderedMeasures(score)) {
    const a = m.attributes;
    if (a?.divisions != null) divisions = a.divisions;
    if (a?.key) key = a.key;
    if (a?.time) time = a.time;
    if (a?.clef) clef = a.clef;
    map.set(m.id, { divisions, key, time, clef });
  }
  return map;
}
