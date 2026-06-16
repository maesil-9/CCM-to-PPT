/**
 * Music structure validation (PRD §SCR-002, §13).
 *
 * Implements the required rule set. Any `error`/`fatal` issue blocks approval
 * and final PPTX generation (PRD PPT-003). Rules are deterministic and operate
 * purely on ScoreIR.
 */
import { computeActiveAttributes, orderedMeasures } from "../context.js";
import { eventDurationDivisions, measureDurationDivisions } from "../duration.js";
import type { Note, Pitch, ScoreIR } from "../types/scoreir.js";
import type {
  ScoreValidationIssue,
  ScoreValidationResult,
  SuggestedAction,
} from "../types/validation.js";

const SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Reasonable melodic range as MIDI note numbers (C2..C7). */
const MIN_MIDI = 36;
const MAX_MIDI = 96;

function midiOf(pitch: Pitch): number {
  return (pitch.octave + 1) * 12 + (SEMITONE[pitch.step] ?? 0) + (pitch.alter ?? 0);
}

function issue(
  code: string,
  severity: ScoreValidationIssue["severity"],
  message: string,
  extra: Partial<ScoreValidationIssue> = {},
): ScoreValidationIssue {
  const actions: SuggestedAction[] = extra.suggestedActions ?? [];
  return {
    code,
    severity,
    message,
    repairable: extra.repairable ?? false,
    suggestedActions: actions,
    ...(extra.entityId ? { entityId: extra.entityId } : {}),
    ...(extra.measureId ? { measureId: extra.measureId } : {}),
    ...(extra.sourceRegionId ? { sourceRegionId: extra.sourceRegionId } : {}),
  };
}

export function validateScore(score: ScoreIR): ScoreValidationResult {
  const issues: ScoreValidationIssue[] = [];
  const active = computeActiveAttributes(score);
  const ordered = orderedMeasures(score);

  // --- MEASURE_DURATION_MATCH / PICKUP_MEASURE_ALLOWED / NOTE_ORDER_VALID ---
  ordered.forEach((measure) => {
    const ctx = active.get(measure.id);
    if (!ctx) return;

    let sum = 0;
    for (const ev of measure.events) {
      if (ev.measureId !== measure.id) {
        issues.push(
          issue("NOTE_ORDER_VALID", "error", `Event ${ev.id} references measure ${ev.measureId} but lives in ${measure.id}`, {
            entityId: ev.id,
            measureId: measure.id,
          }),
        );
      }
      try {
        sum += eventDurationDivisions(ev.duration, ctx.divisions);
      } catch (err) {
        issues.push(
          issue("MEASURE_DURATION_MATCH", "error", `Unsupported duration in ${ev.id}: ${(err as Error).message}`, {
            entityId: ev.id,
            measureId: measure.id,
          }),
        );
      }
    }

    const expected = measureDurationDivisions(ctx.time, ctx.divisions);
    if (measure.pickup) {
      if (measure.index !== 0) {
        issues.push(
          issue("PICKUP_MEASURE_ALLOWED", "warning", `Pickup measure ${measure.id} is not the first measure`, {
            measureId: measure.id,
          }),
        );
      }
      if (sum <= 0 || sum > expected) {
        issues.push(
          issue("PICKUP_MEASURE_ALLOWED", "error", `Pickup measure ${measure.id} duration ${sum} must be >0 and <= ${expected}`, {
            measureId: measure.id,
            repairable: true,
          }),
        );
      }
    } else if (sum !== expected) {
      issues.push(
        issue("MEASURE_DURATION_MATCH", "error", `Measure ${measure.id} has ${sum} divisions, expected ${expected} for ${ctx.time.beats}/${ctx.time.beatType}`, {
          measureId: measure.id,
          repairable: true,
          suggestedActions: [{ kind: "review_durations", description: "Adjust note/rest durations to fill the measure" }],
        }),
      );
    }

    // Chord offsets must land inside the measure.
    for (const h of measure.harmonies ?? []) {
      if (!Number.isInteger(h.offsetDivisions) || h.offsetDivisions < 0 || h.offsetDivisions >= expected) {
        issues.push(
          issue("HARMONY_OFFSET_IN_RANGE", "error", `Harmony ${h.id} offset ${h.offsetDivisions} is outside [0, ${expected}) for measure ${measure.id}`, {
            entityId: h.id,
            measureId: measure.id,
            repairable: true,
            suggestedActions: [{ kind: "clamp_offset", description: "Move the chord to a valid in-measure position" }],
          }),
        );
      }
    }
  });

  // --- PITCH_RANGE_REASONABLE / ACCIDENTAL_SCOPE_VALID ---
  forEachNote(score, (note) => {
    const midi = midiOf(note.pitch);
    if (midi < MIN_MIDI || midi > MAX_MIDI) {
      issues.push(
        issue("PITCH_RANGE_REASONABLE", "warning", `Note ${note.id} pitch (MIDI ${midi}) is outside the expected melodic range`, {
          entityId: note.id,
          measureId: note.measureId,
        }),
      );
    }
    const alter = note.pitch.alter ?? 0;
    if (alter < -2 || alter > 2) {
      issues.push(
        issue("ACCIDENTAL_SCOPE_VALID", "error", `Note ${note.id} has invalid alteration ${alter} (must be -2..2)`, {
          entityId: note.id,
          measureId: note.measureId,
        }),
      );
    }
  });

  // --- TIE_TARGET_EXISTS / TIE_PITCH_MATCH ---
  const noteSeq = collectNotes(score);
  noteSeq.forEach((note, i) => {
    if (note.tie?.start) {
      const next = noteSeq[i + 1];
      if (!next || !next.tie?.stop) {
        issues.push(
          issue("TIE_TARGET_EXISTS", "error", `Note ${note.id} starts a tie with no following tie-stop note`, {
            entityId: note.id,
            measureId: note.measureId,
          }),
        );
      } else if (!samePitch(note.pitch, next.pitch)) {
        issues.push(
          issue("TIE_PITCH_MATCH", "error", `Tie from ${note.id} to ${next.id} connects different pitches`, {
            entityId: note.id,
            measureId: note.measureId,
          }),
        );
      }
    }
    if (note.tie?.stop) {
      const prev = noteSeq[i - 1];
      if (!prev || !prev.tie?.start) {
        issues.push(
          issue("TIE_TARGET_EXISTS", "error", `Note ${note.id} stops a tie with no preceding tie-start note`, {
            entityId: note.id,
            measureId: note.measureId,
          }),
        );
      }
    }
  });

  // --- LYRIC_NOTE_REFERENCE_EXISTS / VERSE_NUMBER_VALID ---
  forEachNote(score, (note) => {
    for (const ly of note.lyrics ?? []) {
      if (!Number.isInteger(ly.verse) || ly.verse < 1) {
        issues.push(
          issue("VERSE_NUMBER_VALID", "error", `Note ${note.id} has invalid verse number ${ly.verse}`, {
            entityId: note.id,
            measureId: note.measureId,
          }),
        );
      }
      if (ly.text.trim() === "" && !ly.extend) {
        issues.push(
          issue("LYRIC_NOTE_REFERENCE_EXISTS", "warning", `Note ${note.id} has an empty lyric (verse ${ly.verse})`, {
            entityId: note.id,
            measureId: note.measureId,
          }),
        );
      }
    }
  });

  // Presentation verse references must point to verses that exist.
  const availableVerses = new Set<number>();
  forEachNote(score, (n) => n.lyrics?.forEach((l) => availableVerses.add(l.verse)));
  for (const item of score.presentation.order) {
    if (item.verse !== undefined && availableVerses.size > 0 && !availableVerses.has(item.verse)) {
      issues.push(
        issue("VERSE_NUMBER_VALID", "warning", `Presentation item ${item.id} references verse ${item.verse}, which has no lyrics`, {
          entityId: item.id,
        }),
      );
    }
  }

  // --- REPEAT_START_END_BALANCED / ENDING_REFERENCE_VALID ---
  validateRepeatsAndEndings(score, issues);

  // --- NO_ORPHANED_SOURCE_REGION / DANGLING_SOURCE_REGION ---
  validateSourceRegions(score, issues);

  const hasBlocking = issues.some((i) => i.severity === "error" || i.severity === "fatal");
  return { issues, ok: !hasBlocking, hasBlocking };
}

function validateRepeatsAndEndings(score: ScoreIR, issues: ScoreValidationIssue[]): void {
  const ordered = orderedMeasures(score);
  let openRepeats = 0;
  let endingOpen = false;

  for (const measure of ordered) {
    for (const bl of measure.barlines ?? []) {
      if (bl.repeat?.direction === "forward") openRepeats++;
      if (bl.repeat?.direction === "backward") {
        if (openRepeats > 0) openRepeats--;
        // backward without an explicit forward implies repeat from the start — allowed.
      }
      if (bl.ending) {
        if (bl.ending.numbers.some((n) => n < 1)) {
          issues.push(
            issue("ENDING_REFERENCE_VALID", "error", `Measure ${measure.id} has an ending number < 1`, {
              measureId: measure.id,
            }),
          );
        }
        if (bl.ending.type === "start") endingOpen = true;
        else if (bl.ending.type === "stop" || bl.ending.type === "discontinue") {
          if (!endingOpen) {
            issues.push(
              issue("ENDING_REFERENCE_VALID", "warning", `Measure ${measure.id} ends an ending that was never started`, {
                measureId: measure.id,
              }),
            );
          }
          endingOpen = false;
        }
      }
    }
  }

  if (openRepeats > 0) {
    issues.push(
      issue("REPEAT_START_END_BALANCED", "warning", `${openRepeats} forward repeat(s) have no matching backward repeat`, {}),
    );
  }
}

function validateSourceRegions(score: ScoreIR, issues: ScoreValidationIssue[]): void {
  const regionIds = new Set(score.sourceRegions.map((r) => r.id));
  const referenced = new Set<string>();

  const ref = (id: string | undefined, entityId: string, measureId?: string) => {
    if (id === undefined) return;
    referenced.add(id);
    if (!regionIds.has(id)) {
      issues.push(
        issue("DANGLING_SOURCE_REGION", "error", `Entity ${entityId} references missing source region ${id}`, {
          entityId,
          sourceRegionId: id,
          ...(measureId ? { measureId } : {}),
        }),
      );
    }
  };

  for (const measure of score.measures) {
    for (const ev of measure.events) ref(ev.sourceRegionId, ev.id, measure.id);
  }

  for (const region of score.sourceRegions) {
    if (!referenced.has(region.id)) {
      issues.push(
        issue("NO_ORPHANED_SOURCE_REGION", "warning", `Source region ${region.id} is not referenced by any entity`, {
          sourceRegionId: region.id,
        }),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function forEachNote(score: ScoreIR, fn: (note: Note) => void): void {
  for (const measure of orderedMeasures(score)) {
    for (const ev of measure.events) {
      if (ev.kind === "note") fn(ev);
    }
  }
}

function collectNotes(score: ScoreIR): Note[] {
  const out: Note[] = [];
  for (const measure of orderedMeasures(score)) {
    for (const ev of measure.events) {
      if (ev.kind === "note") out.push(ev);
    }
  }
  return out;
}

function samePitch(a: Pitch, b: Pitch): boolean {
  return a.step === b.step && (a.alter ?? 0) === (b.alter ?? 0) && a.octave === b.octave;
}
