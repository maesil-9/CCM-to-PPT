/**
 * Deterministic chord-symbol text derived from a HarmonyChord's root/kind/bass.
 *
 * Using a single derivation (instead of relying on the renderer's own guess or
 * a possibly-stale cached `text`) keeps the displayed chord consistent across
 * transposition and between the transposed/original key.
 */
import type { RootStep } from "./types/scoreir.js";

const ACCIDENTAL: Record<number, string> = {
  [-2]: "bb",
  [-1]: "b",
  [0]: "",
  [1]: "#",
  [2]: "##",
};

/** MusicXML harmony `kind` value → display suffix. */
const KIND_SUFFIX: Record<string, string> = {
  major: "",
  minor: "m",
  augmented: "aug",
  diminished: "dim",
  dominant: "7",
  "major-seventh": "maj7",
  "minor-seventh": "m7",
  "diminished-seventh": "dim7",
  "half-diminished": "m7b5",
  "dominant-ninth": "9",
  "major-sixth": "6",
  "minor-sixth": "m6",
  "suspended-second": "sus2",
  "suspended-fourth": "sus4",
  power: "5",
};

function rootText(root: RootStep): string {
  return `${root.step}${ACCIDENTAL[root.alter ?? 0] ?? ""}`;
}

/**
 * The quality suffix only (no root, no bass): major→"", minor→"m", dominant→"7".
 * MusicXML renders the root from <root> and the bass from <bass>, so the <kind>
 * `text` attribute must carry the suffix ALONE — otherwise the root prints twice
 * (e.g. "CC", "Dm7" → "DDm7").
 */
export function deriveChordSuffix(kind: string): string {
  return kind in KIND_SUFFIX ? (KIND_SUFFIX[kind] ?? "") : kind;
}

/** Full human-readable chord text (root + suffix + optional slash bass). */
export function deriveChordText(root: RootStep, kind: string, bass?: RootStep): string {
  const base = `${rootText(root)}${deriveChordSuffix(kind)}`;
  return bass ? `${base}/${rootText(bass)}` : base;
}
