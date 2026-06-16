/**
 * Zod schema for ScoreIR (PRD §SCR-001 "JSON Schema 또는 Zod").
 *
 * The hand-written interfaces in `types/scoreir.ts` remain the canonical types;
 * this schema enforces structural integrity at trust boundaries (fixtures,
 * persisted revisions, API payloads) and powers property tests.
 */
import { z } from "zod";
import type { ScoreIR } from "../types/scoreir.js";

const stepSchema = z.enum(["A", "B", "C", "D", "E", "F", "G"]);
const noteTypeSchema = z.enum(["whole", "half", "quarter", "eighth", "16th", "32nd"]);

const pitchSchema = z.object({
  step: stepSchema,
  alter: z.number().int().min(-2).max(2).optional(),
  octave: z.number().int(),
});

const durationSchema = z.object({
  type: noteTypeSchema,
  dots: z.number().int().min(0).max(2),
  timeModification: z
    .object({
      actualNotes: z.number().int().positive().max(16),
      normalNotes: z.number().int().positive().max(16),
    })
    .optional(),
});

const keySchema = z.object({
  fifths: z.number().int().min(-7).max(7),
  mode: z.enum(["major", "minor"]),
});

const timeSchema = z.object({
  beats: z.number().int().positive(),
  beatType: z.number().int().positive(),
  symbol: z.enum(["common", "cut", "normal"]).optional(),
});

const clefSchema = z.object({
  sign: z.enum(["G", "F", "C"]),
  line: z.number().int(),
  octaveChange: z.number().int().optional(),
});

const lyricSchema = z.object({
  verse: z.number().int().positive().max(64),
  text: z.string().max(200),
  syllabic: z.enum(["single", "begin", "middle", "end"]),
  extend: z.boolean().optional(),
});

const tieSchema = z.object({ start: z.boolean(), stop: z.boolean() });

const ornamentSchema = z.enum([
  "trill",
  "mordent",
  "inverted-mordent",
  "turn",
  "inverted-turn",
]);

const noteSchema = z.object({
  id: z.string(),
  kind: z.literal("note"),
  measureId: z.string(),
  voice: z.number().int().positive(),
  staff: z.number().int().positive(),
  pitch: pitchSchema,
  duration: durationSchema,
  tie: tieSchema.optional(),
  slur: tieSchema.optional(),
  tuplet: tieSchema.optional(),
  fermata: z.boolean().optional(),
  ornaments: z.array(ornamentSchema).max(8).optional(),
  lyrics: z.array(lyricSchema).max(8).optional(),
  confidence: z
    .object({
      pitch: z.number().optional(),
      duration: z.number().optional(),
      lyric: z.number().optional(),
    })
    .optional(),
  sourceRegionId: z.string().optional(),
});

const restSchema = z.object({
  id: z.string(),
  kind: z.literal("rest"),
  measureId: z.string(),
  voice: z.number().int().positive(),
  staff: z.number().int().positive(),
  duration: durationSchema,
  sourceRegionId: z.string().optional(),
});

const eventSchema = z.discriminatedUnion("kind", [noteSchema, restSchema]);

const barlineSchema = z.object({
  location: z.enum(["left", "right"]),
  style: z
    .enum(["regular", "light-light", "light-heavy", "heavy-light", "final", "none"])
    .optional(),
  repeat: z
    .object({
      direction: z.enum(["forward", "backward"]),
      times: z.number().int().positive().optional(),
    })
    .optional(),
  ending: z
    .object({
      numbers: z.array(z.number().int().positive()),
      type: z.enum(["start", "stop", "discontinue"]),
    })
    .optional(),
});

const rootStepSchema = z.object({
  step: stepSchema,
  alter: z.number().int().min(-2).max(2).optional(),
});

const harmonySchema = z.object({
  id: z.string(),
  offsetDivisions: z.number().int().min(0),
  root: rootStepSchema,
  kind: z.string(),
  bass: rootStepSchema.optional(),
  text: z.string().optional(),
  sourceRegionId: z.string().optional(),
});

const dynamicMarkSchema = z.enum(["pp", "p", "mp", "mf", "f", "ff", "fp", "sf", "sfz"]);

const navigationSchema = z.object({
  sign: z.enum(["segno", "coda"]).optional(),
  jump: z.enum(["da-capo", "dal-segno"]).optional(),
  target: z.enum(["fine", "coda"]).optional(),
  fine: z.boolean().optional(),
  words: z.string().max(120).optional(),
});

const directionSchema = z.object({
  offsetDivisions: z.number().int().min(0).optional(),
  placement: z.enum(["above", "below"]).optional(),
  dynamics: dynamicMarkSchema.optional(),
  navigation: navigationSchema.optional(),
  words: z.string().max(200).optional(),
});

const measureSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  index: z.number().int().min(0),
  pickup: z.boolean().optional(),
  attributes: z
    .object({
      divisions: z.number().int().positive().optional(),
      key: keySchema.optional(),
      time: timeSchema.optional(),
      clef: clefSchema.optional(),
    })
    .optional(),
  events: z.array(eventSchema).max(512),
  harmonies: z.array(harmonySchema).max(128).optional(),
  directions: z.array(directionSchema).max(64).optional(),
  barlines: z.array(barlineSchema).max(8).optional(),
  sectionId: z.string().optional(),
});

const sectionSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "intro",
    "verse",
    "preChorus",
    "chorus",
    "bridge",
    "interlude",
    "tag",
    "ending",
    "custom",
  ]),
  label: z.string().optional(),
  number: z.number().int().optional(),
  startMeasureId: z.string(),
  endMeasureId: z.string(),
});

const sourceRegionSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  pageNumber: z.number().int(),
  bbox: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
  }),
  imageAssetId: z.string().optional(),
  contentHash: z.string(),
});

const uncertaintySchema = z.object({
  id: z.string(),
  entityId: z.string(),
  field: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  status: z.enum(["open", "resolved", "dismissed"]),
  candidates: z.array(
    z.object({ value: z.unknown(), confidence: z.number(), source: z.string() }),
  ),
  validationFailures: z.array(z.string()),
});

const presentationItemSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  verse: z.number().int().positive().max(64).optional(),
  repeatCount: z.number().int().positive().max(32).optional(),
  hidden: z.boolean().optional(),
  label: z.string().max(120).optional(),
});

export const scoreIrSchema = z.object({
  scoreId: z.string(),
  schemaVersion: z.string(),
  metadata: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    composer: z.string().optional(),
    lyricist: z.string().optional(),
    arranger: z.string().optional(),
    copyright: z.string().optional(),
    ccli: z.string().optional(),
    language: z.string().optional(),
  }),
  musicalContext: z.object({
    divisions: z.number().int().positive(),
    initialKey: keySchema,
    initialTime: timeSchema,
    initialClef: clefSchema,
    tempoBpm: z.number().positive().finite().max(400).optional(),
  }),
  parts: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      staffCount: z.number().int().positive(),
    }),
  ),
  measures: z.array(measureSchema).max(2000),
  sections: z.array(sectionSchema).max(500),
  sourceRegions: z.array(sourceRegionSchema).max(5000),
  uncertainties: z.array(uncertaintySchema).max(5000),
  presentation: z.object({
    profileRef: z.string().optional(),
    chordVisibility: z.enum(["hidden", "visible"]),
    order: z.array(presentationItemSchema).max(1000),
  }),
});

// ---------------------------------------------------------------------------
// Compile-time single-source-of-truth guard (PRD §SCR-001)
// ---------------------------------------------------------------------------
// The hand-written interfaces in `types/scoreir.ts` and this zod schema must
// describe the exact same shape. The two assignments below fail to compile if
// they drift apart in either direction (a field added/removed/retyped on one
// side only). Reconcile both sides; never paper over a mismatch with `as`.
type InferredScoreIR = z.infer<typeof scoreIrSchema>;
const _schemaSatisfiesType: (value: InferredScoreIR) => ScoreIR = (value) => value;
const _typeSatisfiesSchema: (value: ScoreIR) => InferredScoreIR = (value) => value;
void _schemaSatisfiesType;
void _typeSatisfiesSchema;

export function parseScoreIr(data: unknown): ScoreIR {
  // No cast: the guard above proves the parsed shape is exactly `ScoreIR`.
  return scoreIrSchema.parse(data);
}

export function safeParseScoreIr(data: unknown) {
  return scoreIrSchema.safeParse(data);
}
