/**
 * Fixed, rights-clear ScoreIR fixture for Milestone 1 (PRD §8 Milestone 1,
 * §17 "권리가 불명확한 상업 악보를 테스트 저장소에 넣지 않는다").
 *
 * This is an ORIGINAL synthetic worship melody written for testing — not a
 * copyrighted hymn. Clean single-staff, C major, 4/4, two verses, a verse and
 * a chorus section, a repeated chorus, and one tie (melisma) to exercise the
 * full deterministic chain.
 */
import {
  DEFAULT_DIVISIONS,
  SCOREIR_SCHEMA_VERSION,
  type Measure,
  type Note,
  type NoteTypeName,
  type ScoreEvent,
  type ScoreIR,
  type StepName,
  type Syllabic,
} from "@worship-score/core";

interface LyricSpec {
  verse: number;
  text: string;
  syllabic?: Syllabic;
  extend?: boolean;
}

interface NoteSpec {
  step: StepName;
  octave: number;
  type: NoteTypeName;
  dots?: number;
  lyrics?: LyricSpec[];
  tie?: { start: boolean; stop: boolean };
}

interface MeasureSpec {
  number: number;
  notes: NoteSpec[];
}

function buildNote(measureId: string, idx: number, spec: NoteSpec): Note {
  const note: Note = {
    id: `${measureId}-n${idx}`,
    kind: "note",
    measureId,
    voice: 1,
    staff: 1,
    pitch: { step: spec.step, octave: spec.octave },
    duration: { type: spec.type, dots: spec.dots ?? 0 },
  };
  if (spec.lyrics) {
    note.lyrics = spec.lyrics.map((l) => ({
      verse: l.verse,
      text: l.text,
      syllabic: l.syllabic ?? "single",
      ...(l.extend ? { extend: true } : {}),
    }));
  }
  if (spec.tie) note.tie = spec.tie;
  return note;
}

// Verse melody (measures 1-4) — sung with two different verse lyrics.
const VERSE: MeasureSpec[] = [
  {
    number: 1,
    notes: [
      { step: "C", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "주" }, { verse: 2, text: "어" }] },
      { step: "D", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "님" }, { verse: 2, text: "둠" }] },
      { step: "E", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "의" }, { verse: 2, text: "속" }] },
      { step: "F", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "크" }, { verse: 2, text: "에" }] },
    ],
  },
  {
    number: 2,
    notes: [
      { step: "G", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "신" }, { verse: 2, text: "빛" }] },
      { step: "G", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "사" }, { verse: 2, text: "으" }] },
      { step: "A", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "랑" }, { verse: 2, text: "로" }] },
      { step: "G", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "을" }, { verse: 2, text: "와" }] },
    ],
  },
  {
    number: 3,
    notes: [
      { step: "F", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "찬" }, { verse: 2, text: "구" }] },
      { step: "E", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "양" }, { verse: 2, text: "원" }] },
      { step: "D", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "하" }, { verse: 2, text: "하" }] },
      { step: "C", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "리" }, { verse: 2, text: "신" }] },
    ],
  },
  {
    number: 4,
    notes: [
      { step: "C", octave: 4, type: "half", lyrics: [{ verse: 1, text: "영" }, { verse: 2, text: "주" }] },
      { step: "D", octave: 4, type: "half", lyrics: [{ verse: 1, text: "원" }, { verse: 2, text: "님" }] },
    ],
  },
];

// Chorus melody (measures 5-8) — repeated, single lyric set.
const CHORUS: MeasureSpec[] = [
  {
    number: 5,
    notes: [
      { step: "E", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "할" }] },
      { step: "E", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "렐" }] },
      { step: "F", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "루" }] },
      { step: "G", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "야" }] },
    ],
  },
  {
    number: 6,
    notes: [
      { step: "G", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "주" }] },
      { step: "F", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "께" }] },
      { step: "E", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "영" }] },
      { step: "D", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "광" }] },
    ],
  },
  {
    number: 7,
    notes: [
      { step: "C", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "다" }] },
      { step: "D", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "같" }] },
      { step: "E", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "이" }] },
      { step: "F", octave: 4, type: "quarter", lyrics: [{ verse: 1, text: "찬" }] },
    ],
  },
  {
    number: 8,
    notes: [
      { step: "E", octave: 4, type: "half", tie: { start: true, stop: false }, lyrics: [{ verse: 1, text: "양", extend: true }] },
      { step: "E", octave: 4, type: "half", tie: { start: false, stop: true } },
    ],
  },
];

export function buildCleanDigitalSample(): ScoreIR {
  const measures: Measure[] = [];
  const all = [...VERSE, ...CHORUS];

  all.forEach((spec, mi) => {
    const measureId = `m${spec.number}`;
    const events: ScoreEvent[] = spec.notes.map((n, ni) => buildNote(measureId, ni + 1, n));
    const measure: Measure = {
      id: measureId,
      number: spec.number,
      index: mi,
      events,
    };

    // First measure carries the initial attributes explicitly.
    if (mi === 0) {
      measure.attributes = {
        divisions: DEFAULT_DIVISIONS,
        key: { fifths: 0, mode: "major" },
        time: { beats: 4, beatType: 4 },
        clef: { sign: "G", line: 2 },
      };
    }

    // Chorus repeat barlines (forward at m5, backward at m8).
    if (spec.number === 5) {
      measure.barlines = [{ location: "left", style: "heavy-light", repeat: { direction: "forward" } }];
    }
    if (spec.number === 8) {
      measure.barlines = [{ location: "right", style: "light-heavy", repeat: { direction: "backward" } }];
    }

    measures.push(measure);
  });

  return {
    scoreId: "fixture-clean-digital-001",
    schemaVersion: SCOREIR_SCHEMA_VERSION,
    metadata: {
      title: "샘플 찬양 (Sample Worship Melody)",
      composer: "WorshipScore AI Test Fixtures",
      copyright: "Original synthetic test data — public domain",
      language: "ko",
    },
    musicalContext: {
      divisions: DEFAULT_DIVISIONS,
      initialKey: { fifths: 0, mode: "major" },
      initialTime: { beats: 4, beatType: 4 },
      initialClef: { sign: "G", line: 2 },
      tempoBpm: 84,
    },
    parts: [{ id: "P1", name: "Melody", staffCount: 1 }],
    measures,
    sections: [
      { id: "sec-verse", kind: "verse", startMeasureId: "m1", endMeasureId: "m4" },
      { id: "sec-chorus", kind: "chorus", startMeasureId: "m5", endMeasureId: "m8" },
    ],
    sourceRegions: [],
    uncertainties: [],
    presentation: {
      chordVisibility: "hidden",
      // Labels are auto-generated per metadata.language (ko → "1절", "후렴").
      order: [
        { id: "p1", sectionId: "sec-verse", verse: 1 },
        { id: "p2", sectionId: "sec-chorus", verse: 1 },
        { id: "p3", sectionId: "sec-verse", verse: 2 },
        { id: "p4", sectionId: "sec-chorus", verse: 1 },
      ],
    },
  };
}
