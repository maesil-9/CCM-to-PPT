import {
  DEFAULT_DIVISIONS,
  SCOREIR_SCHEMA_VERSION,
  type Measure,
  type Note,
  type NoteTypeName,
  type ScoreEvent,
  type ScoreIR,
  type StepName,
} from "@worship-score/core";

export function qn(
  measureId: string,
  i: number,
  step: StepName,
  octave: number,
  type: NoteTypeName = "quarter",
  extra: Partial<Note> = {},
): Note {
  return {
    id: `${measureId}-n${i}`,
    kind: "note",
    measureId,
    voice: 1,
    staff: 1,
    pitch: { step, octave },
    duration: { type, dots: 0 },
    ...extra,
  };
}

export function measure(
  id: string,
  index: number,
  events: ScoreEvent[],
  withAttrs = false,
): Measure {
  const m: Measure = { id, number: index + 1, index, events };
  if (withAttrs) {
    m.attributes = {
      divisions: DEFAULT_DIVISIONS,
      key: { fifths: 0, mode: "major" },
      time: { beats: 4, beatType: 4 },
      clef: { sign: "G", line: 2 },
    };
  }
  return m;
}

export function scoreOf(measures: Measure[], overrides: Partial<ScoreIR> = {}): ScoreIR {
  return {
    scoreId: "test-score",
    schemaVersion: SCOREIR_SCHEMA_VERSION,
    metadata: { title: "Test Title" },
    musicalContext: {
      divisions: DEFAULT_DIVISIONS,
      initialKey: { fifths: 0, mode: "major" },
      initialTime: { beats: 4, beatType: 4 },
      initialClef: { sign: "G", line: 2 },
    },
    parts: [{ id: "P1", name: "Melody", staffCount: 1 }],
    measures,
    sections: [],
    sourceRegions: [],
    uncertainties: [],
    presentation: { chordVisibility: "hidden", order: [] },
    ...overrides,
  };
}

/** A single valid 4/4 measure: C D E F quarters. */
export function validMeasure(id = "m1", index = 0): Measure {
  return measure(
    id,
    index,
    [
      qn(id, 1, "C", 4),
      qn(id, 2, "D", 4),
      qn(id, 3, "E", 4),
      qn(id, 4, "F", 4),
    ],
    index === 0,
  );
}
