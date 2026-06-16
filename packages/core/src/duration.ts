/**
 * Deterministic duration arithmetic shared by validation and MusicXML output.
 *
 * `divisions` here is MusicXML's "divisions per quarter note". Event durations
 * and measure capacities are always expressed in these integer division units
 * so that {@link measureDurationDivisions} comparisons are exact.
 */
import type { Duration, NoteTypeName, Time } from "./types/scoreir.js";

/** Quarter-note multiples for each supported note type. */
const QUARTER_MULTIPLE: Record<NoteTypeName, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  "16th": 0.25,
  "32nd": 0.125,
};

/** Dot augmentation factor: 1 dot = 1.5x, 2 dots = 1.75x. */
function dotFactor(dots: number): number {
  if (dots < 0) throw new RangeError(`dots must be >= 0, got ${dots}`);
  // 2 - (1/2^dots)
  return 2 - 1 / Math.pow(2, dots);
}

/**
 * Recommended divisions-per-quarter for the MVP note set (down to 16th with a
 * single dot). 8 keeps every supported duration an integer.
 */
export const DEFAULT_DIVISIONS = 8;

/**
 * Duration of a single event in division units.
 * @throws if the result is not an integer (unsupported subdivision for the
 *   given `divisions`), which the caller should surface rather than round.
 */
export function eventDurationDivisions(
  duration: Duration,
  divisions: number,
): number {
  const raw = QUARTER_MULTIPLE[duration.type] * divisions * dotFactor(duration.dots);
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > 1e-9) {
    throw new RangeError(
      `Non-integer duration: ${duration.type}${".".repeat(duration.dots)} at divisions=${divisions} -> ${raw}`,
    );
  }
  return rounded;
}

/**
 * Total division capacity of one full measure in the given time signature.
 * Example: 4/4 at divisions=8 -> 32; 6/8 -> 24; 3/4 -> 24.
 */
export function measureDurationDivisions(time: Time, divisions: number): number {
  const perBeat = (divisions * 4) / time.beatType;
  const raw = time.beats * perBeat;
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > 1e-9) {
    throw new RangeError(
      `Time signature ${time.beats}/${time.beatType} not representable at divisions=${divisions}`,
    );
  }
  return rounded;
}
