/**
 * ScoreIR — internal score model (PRD §10, §SCR-001).
 *
 * This is the service's editable source of truth, kept deliberately separate
 * from MusicXML (the interchange format). It carries information MusicXML does
 * not represent well: original page coordinates, per-field confidence, OMR
 * candidates, evidence sources, user overrides, and presentation planning.
 *
 * Milestone 1 only requires a clean, single-staff melody with lyrics, but the
 * shape is forward-compatible with OMR/AI-derived uncertainty (PRD §10.1).
 */

export const SCOREIR_SCHEMA_VERSION = "scoreir-0.1.0";

export type ResolutionState =
  | "resolved"
  | "uncertain"
  | "conflicting"
  | "missing"
  | "unsupported";

// ---------------------------------------------------------------------------
// Musical primitives
// ---------------------------------------------------------------------------

export type StepName = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export interface Pitch {
  step: StepName;
  /** Chromatic alteration in semitones: -2..2 (double-flat .. double-sharp). */
  alter?: number;
  /** Scientific octave (middle C = C4). */
  octave: number;
}

/** MusicXML note-type values supported by the MVP (down to 16th notes). */
export type NoteTypeName =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "16th"
  | "32nd";

export interface TimeModification {
  /** Notes actually played in the time of `normalNotes` (e.g. 3 for a triplet). */
  actualNotes: number;
  /** Notes the group nominally occupies (e.g. 2 for a triplet). */
  normalNotes: number;
}

export interface Duration {
  type: NoteTypeName;
  /** Augmentation dots (0..2). MVP commonly uses 0 or 1. */
  dots: number;
  /**
   * Tuplet ratio (triplets etc). Requires `divisions` divisible by the actual
   * count so the scaled duration stays an integer (e.g. divisions=24 for triplets).
   */
  timeModification?: TimeModification;
}

export type Mode = "major" | "minor";

export interface Key {
  /** Circle-of-fifths value: -7..7 (negative = flats, positive = sharps). */
  fifths: number;
  mode: Mode;
}

export interface Time {
  beats: number;
  beatType: number;
  /** Visual symbol; "normal" renders the numeric fraction. */
  symbol?: "common" | "cut" | "normal";
}

export type ClefSign = "G" | "F" | "C";

export interface Clef {
  sign: ClefSign;
  /** Staff line the clef sits on (G clef = 2). */
  line: number;
  /** Octave displacement (e.g. -1 for treble-8). */
  octaveChange?: number;
}

// ---------------------------------------------------------------------------
// Lyrics
// ---------------------------------------------------------------------------

export type Syllabic = "single" | "begin" | "middle" | "end";

export interface Lyric {
  /** 1-based verse number. */
  verse: number;
  text: string;
  syllabic: Syllabic;
  /** Melisma extension to following notes. */
  extend?: boolean;
}

// ---------------------------------------------------------------------------
// Events (notes and rests)
// ---------------------------------------------------------------------------

export interface NoteConfidence {
  pitch?: number;
  duration?: number;
  lyric?: number;
}

export interface Note {
  id: string;
  kind: "note";
  measureId: string;
  voice: number;
  staff: number;
  pitch: Pitch;
  duration: Duration;
  tie?: { start: boolean; stop: boolean };
  slur?: { start: boolean; stop: boolean };
  /** Tuplet group bracket (paired with duration.timeModification). */
  tuplet?: { start: boolean; stop: boolean };
  /** Fermata (늘임표) on this note. */
  fermata?: boolean;
  lyrics?: Lyric[];
  /** Optional per-field confidence (PRD §10.2). Absent on hand-authored data. */
  confidence?: NoteConfidence;
  sourceRegionId?: string;
}

export interface Rest {
  id: string;
  kind: "rest";
  measureId: string;
  voice: number;
  staff: number;
  duration: Duration;
  sourceRegionId?: string;
}

export type ScoreEvent = Note | Rest;

// ---------------------------------------------------------------------------
// Measures
// ---------------------------------------------------------------------------

export type BarStyle =
  | "regular"
  | "light-light"
  | "light-heavy"
  | "heavy-light"
  | "final"
  | "none";

export type RepeatDirection = "forward" | "backward";

export interface RepeatMark {
  direction: RepeatDirection;
  /** Number of times the section plays (backward repeats). */
  times?: number;
}

export interface Ending {
  /** Ending numbers, e.g. [1] for first ending, [2] for second. */
  numbers: number[];
  type: "start" | "stop" | "discontinue";
}

export interface MeasureAttributes {
  /** Divisions per quarter note. Set on the first measure; changes are rare. */
  divisions?: number;
  key?: Key;
  time?: Time;
  clef?: Clef;
}

export interface Barline {
  location: "left" | "right";
  style?: BarStyle;
  repeat?: RepeatMark;
  ending?: Ending;
}

/**
 * Chord symbol (harmony) — stored as a separate layer (PRD OMR-004). Recognition
 * failures here must not affect the melody, and chords are hidden by default in
 * the final PPT; they are an opt-in display layer.
 */
export interface RootStep {
  step: StepName;
  alter?: number;
}

export interface HarmonyChord {
  id: string;
  /** Beat offset within the measure, in division units (0 = downbeat). */
  offsetDivisions: number;
  root: RootStep;
  /**
   * Chord quality as a MusicXML harmony kind value, e.g. "major", "minor",
   * "dominant", "major-seventh", "minor-seventh", "suspended-fourth".
   */
  kind: string;
  /** Bass note for slash chords (e.g. C/E). */
  bass?: RootStep;
  /** Optional display override (e.g. "G", "Am7", "C/E"); derived if absent. */
  text?: string;
  sourceRegionId?: string;
}

export interface Measure {
  id: string;
  /** Display measure number (1-based; pickup measure may be 0). */
  number: number;
  /** Absolute order in the score (0-based). */
  index: number;
  /** True for an anacrusis / pickup measure (PRD PICKUP_MEASURE_ALLOWED). */
  pickup?: boolean;
  attributes?: MeasureAttributes;
  /** Voice-1 melody events in time order (MVP is monophonic). */
  events: ScoreEvent[];
  /** Optional chord-symbol layer (hidden by default in output). */
  harmonies?: HarmonyChord[];
  barlines?: Barline[];
  sectionId?: string;
}

// ---------------------------------------------------------------------------
// Sections and presentation order
// ---------------------------------------------------------------------------

export type SectionKind =
  | "intro"
  | "verse"
  | "preChorus"
  | "chorus"
  | "bridge"
  | "interlude"
  | "tag"
  | "ending"
  | "custom";

export interface ScoreSection {
  id: string;
  kind: SectionKind;
  label?: string;
  /** Verse number for "verse" sections. */
  number?: number;
  startMeasureId: string;
  endMeasureId: string;
}

export interface PresentationItem {
  id: string;
  sectionId: string;
  /** Which verse's lyrics to display for this occurrence. */
  verse?: number;
  /** How many times this section repeats in the running order. */
  repeatCount?: number;
  hidden?: boolean;
  label?: string;
}

export interface ScorePresentation {
  /** Reference to the presentation profile applied (renderer/layout settings). */
  profileRef?: string;
  chordVisibility: "hidden" | "visible";
  /** Running order of sections for the worship slides (PRD STR-002). */
  order: PresentationItem[];
}

// ---------------------------------------------------------------------------
// Provenance: source regions, evidence, uncertainty
// ---------------------------------------------------------------------------

export interface BBox {
  /** Normalized [0,1] coordinates relative to the source page. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceRegion {
  id: string;
  documentId: string;
  pageNumber: number;
  bbox: BBox;
  imageAssetId?: string;
  contentHash: string;
}

export type EvidenceType =
  | "omr"
  | "ocr"
  | "vision_model"
  | "rule_validator"
  | "manual";

export interface EvidenceSource {
  type: EvidenceType;
  provider: string;
  version: string;
  runId: string;
}

export interface UncertaintyCandidate {
  /**
   * Candidate reading. Typed `unknown` because it depends on `field` (a pitch,
   * a duration type, a lyric string, …). Optional because an `unknown` value
   * already admits `undefined`, and the JSON schema cannot mark it required.
   */
  value?: unknown;
  confidence: number;
  source: string;
}

export interface ScoreUncertainty {
  id: string;
  entityId: string;
  field: string;
  severity: "low" | "medium" | "high";
  status: "open" | "resolved" | "dismissed";
  candidates: UncertaintyCandidate[];
  validationFailures: string[];
}

// ---------------------------------------------------------------------------
// Metadata and musical context
// ---------------------------------------------------------------------------

export interface ScoreMetadata {
  title?: string;
  subtitle?: string;
  composer?: string;
  lyricist?: string;
  arranger?: string;
  copyright?: string;
  ccli?: string;
  /** BCP-47-ish lyric language hint, e.g. "ko", "en". */
  language?: string;
}

export interface MusicalContext {
  /** Divisions per quarter note for the whole score (MusicXML <divisions>). */
  divisions: number;
  initialKey: Key;
  initialTime: Time;
  initialClef: Clef;
  /** Quarter-note BPM, if known. */
  tempoBpm?: number;
}

export interface ScorePart {
  id: string;
  name?: string;
  staffCount: number;
}

// ---------------------------------------------------------------------------
// Top-level ScoreIR
// ---------------------------------------------------------------------------

export interface ScoreIR {
  scoreId: string;
  schemaVersion: string;
  metadata: ScoreMetadata;
  musicalContext: MusicalContext;
  parts: ScorePart[];
  measures: Measure[];
  sections: ScoreSection[];
  sourceRegions: SourceRegion[];
  uncertainties: ScoreUncertainty[];
  presentation: ScorePresentation;
}
