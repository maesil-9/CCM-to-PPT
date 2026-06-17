/**
 * ScoreIR -> MusicXML 4.0 (score-partwise) serializer.
 *
 * Deterministic: same ScoreIR + options always yields the same string.
 *
 * Supports rendering a measure subset (for per-slide rendering) and a verse
 * filter (to show a single verse's lyrics). When a subset is emitted, the first
 * emitted measure always carries the full active attributes (clef/key/time/
 * divisions) so a mid-score slide still renders correctly — PRD §RND-003
 * ("새 시스템에 필요한 음자리표·조표·박자 표시").
 */
import { computeActiveAttributes, orderedMeasures, type ActiveAttributes } from "../context.js";
import { deriveChordSuffix } from "../chord.js";
import { eventDurationDivisions, measureDurationDivisions } from "../duration.js";
import type {
  Barline,
  Clef,
  Direction,
  HarmonyChord,
  Key,
  Measure,
  NavigationDirection,
  Ornament,
  ScoreEvent,
  ScoreIR,
  Time,
} from "../types/scoreir.js";
import { el, renderDocument, type XmlChild, type XmlNode } from "./xml.js";

const MUSICXML_DOCTYPE =
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';

/** Precomputed per-score data, so per-slide serialization avoids O(N·M) rework. */
export interface PreparedScore {
  active: Map<string, ActiveAttributes>;
  ordered: Measure[];
}

export function prepareScore(score: ScoreIR): PreparedScore {
  return { active: computeActiveAttributes(score), ordered: orderedMeasures(score) };
}

export interface SerializeOptions {
  /** Restrict output to these measure ids (in score order). */
  measureIds?: string[];
  /** Restrict lyrics to these verses, renumbered 1..n in output. */
  verses?: number[];
  /** Emit the chord-symbol (harmony) layer. Default false (chords hidden). */
  includeChords?: boolean;
  /** Emit the tempo mark on the first measure. Default true. */
  includeTempo?: boolean;
  /** Suppress the part/instrument name label (e.g. "Melody"). Default false. */
  suppressPartName?: boolean;
  /** Force a new system (staff line) every N emitted measures (encoded breaks). */
  systemBreakEvery?: number;
  /**
   * Measure ids that must begin a new staff system (phrase-based breaks for
   * projection layout). Takes precedence over {@link systemBreakEvery}.
   */
  systemBreakBefore?: string[];
  /** Reuse precomputed score data (see {@link prepareScore}). */
  prepared?: PreparedScore;
}

export function serializeMusicXml(score: ScoreIR, options: SerializeOptions = {}): string {
  const { active, ordered } = options.prepared ?? prepareScore(score);
  const idSet = options.measureIds ? new Set(options.measureIds) : null;
  const selected = idSet ? ordered.filter((m) => idSet.has(m.id)) : ordered;
  const breakBefore = options.systemBreakBefore ? new Set(options.systemBreakBefore) : null;

  const measureNodes: XmlNode[] = selected.map((measure, emittedIndex) => {
    const ctx = active.get(measure.id);
    if (!ctx) throw new Error(`No active attributes for measure ${measure.id}`);
    const children: XmlChild[] = [];

    // Encoded system break. Explicit phrase breaks (projection) take precedence;
    // otherwise wrap every N measures so a leadsheet slide fills its height.
    const breakHere = breakBefore
      ? emittedIndex > 0 && breakBefore.has(measure.id)
      : !!options.systemBreakEvery && emittedIndex > 0 && emittedIndex % options.systemBreakEvery === 0;
    if (breakHere) {
      children.push(el("print", { "new-system": "yes" }));
    }

    const attrNode = buildAttributes(measure, ctx, emittedIndex === 0);
    if (attrNode) children.push(attrNode);

    if (emittedIndex === 0 && score.musicalContext.tempoBpm && options.includeTempo !== false) {
      children.push(buildTempo(score.musicalContext.tempoBpm));
    }

    // Dynamics / navigation markers. Each carries an <offset> from the measure
    // downbeat, so they can all be emitted up front before the note stream.
    for (const direction of measure.directions ?? []) {
      const node = buildDirection(direction);
      if (node) children.push(node);
    }

    // Chord layer: anchor each harmony to the note whose time span contains its
    // onset, emitting a MusicXML <offset> when it is not exactly on that onset.
    // Out-of-measure offsets are dropped here (validation flags them separately).
    const capacity = measureDurationDivisions(ctx.time, ctx.divisions);
    const harmonies =
      options.includeChords && measure.harmonies
        ? measure.harmonies
            .filter((h) => h.offsetDivisions >= 0 && h.offsetDivisions < capacity)
            .slice()
            .sort((a, b) => a.offsetDivisions - b.offsetDivisions)
        : [];
    let hi = 0;
    let cumulative = 0;
    for (const event of measure.events) {
      const nextOnset = cumulative + eventDurationDivisions(event.duration, ctx.divisions);
      while (hi < harmonies.length && harmonies[hi]!.offsetDivisions < nextOnset) {
        children.push(buildHarmony(harmonies[hi]!, harmonies[hi]!.offsetDivisions - cumulative));
        hi++;
      }
      children.push(buildNote(event, ctx.divisions, options.verses));
      cumulative = nextOnset;
    }
    while (hi < harmonies.length) {
      children.push(buildHarmony(harmonies[hi]!, 0));
      hi++;
    }

    for (const barline of measure.barlines ?? []) {
      children.push(buildBarline(barline));
    }

    return el("measure", { number: String(measure.number) }, children);
  });

  const part = el("part", { id: "P1" }, measureNodes);
  // Empty part-name → Verovio prints no instrument label (clutter for slides).
  const partName = options.suppressPartName ? "" : (score.parts[0]?.name ?? "Melody");
  const partList = el("part-list", undefined, [
    el("score-part", { id: "P1" }, [el("part-name", undefined, [partName])]),
  ]);

  const root = el("score-partwise", { version: "4.0" }, [
    ...buildHeader(score),
    partList,
    part,
  ]);

  return renderDocument(root, { doctype: MUSICXML_DOCTYPE });
}

function buildHeader(score: ScoreIR): XmlNode[] {
  const nodes: XmlNode[] = [];
  const { title, composer, lyricist, copyright } = score.metadata;

  if (title) {
    nodes.push(el("work", undefined, [el("work-title", undefined, [title])]));
  }

  const ident: XmlChild[] = [];
  if (composer) ident.push(el("creator", { type: "composer" }, [composer]));
  if (lyricist) ident.push(el("creator", { type: "lyricist" }, [lyricist]));
  if (copyright) ident.push(el("rights", undefined, [copyright]));
  ident.push(
    el("encoding", undefined, [
      el("software", undefined, ["WorshipScore AI"]),
      el("supports", { element: "accidental", type: "yes" }),
    ]),
  );
  nodes.push(el("identification", undefined, ident));

  return nodes;
}

function buildAttributes(
  measure: Measure,
  ctx: ActiveAttributes,
  emitFull: boolean,
): XmlNode | null {
  const kids: XmlChild[] = [];
  const attrs = measure.attributes;

  if (emitFull) {
    kids.push(el("divisions", undefined, [String(ctx.divisions)]));
    kids.push(keyNode(ctx.key));
    kids.push(timeNode(ctx.time));
    kids.push(clefNode(ctx.clef));
  } else {
    if (attrs?.divisions != null) kids.push(el("divisions", undefined, [String(attrs.divisions)]));
    if (attrs?.key) kids.push(keyNode(attrs.key));
    if (attrs?.time) kids.push(timeNode(attrs.time));
    if (attrs?.clef) kids.push(clefNode(attrs.clef));
  }

  return kids.length ? el("attributes", undefined, kids) : null;
}

function keyNode(key: Key): XmlNode {
  return el("key", undefined, [
    el("fifths", undefined, [String(key.fifths)]),
    el("mode", undefined, [key.mode]),
  ]);
}

function timeNode(time: Time): XmlNode {
  const attrs = time.symbol && time.symbol !== "normal" ? { symbol: time.symbol } : undefined;
  return el("time", attrs, [
    el("beats", undefined, [String(time.beats)]),
    el("beat-type", undefined, [String(time.beatType)]),
  ]);
}

function clefNode(clef: Clef): XmlNode {
  const kids: XmlChild[] = [
    el("sign", undefined, [clef.sign]),
    el("line", undefined, [String(clef.line)]),
  ];
  if (clef.octaveChange) kids.push(el("clef-octave-change", undefined, [String(clef.octaveChange)]));
  return el("clef", undefined, kids);
}

function buildNote(
  event: ScoreEvent,
  divisions: number,
  verses: number[] | undefined,
): XmlNode {
  const kids: XmlChild[] = [];

  if (event.kind === "rest") {
    kids.push(el("rest"));
  } else {
    const p = event.pitch;
    const pitchKids: XmlChild[] = [el("step", undefined, [p.step])];
    if (p.alter !== undefined && p.alter !== 0) pitchKids.push(el("alter", undefined, [String(p.alter)]));
    pitchKids.push(el("octave", undefined, [String(p.octave)]));
    kids.push(el("pitch", undefined, pitchKids));
  }

  kids.push(el("duration", undefined, [String(eventDurationDivisions(event.duration, divisions))]));

  // Sounding ties (stop before start per MusicXML convention).
  if (event.kind === "note" && event.tie) {
    if (event.tie.stop) kids.push(el("tie", { type: "stop" }));
    if (event.tie.start) kids.push(el("tie", { type: "start" }));
  }

  kids.push(el("voice", undefined, [String(event.voice)]));
  kids.push(el("type", undefined, [event.duration.type]));
  for (let i = 0; i < event.duration.dots; i++) kids.push(el("dot"));

  if (event.duration.timeModification) {
    kids.push(
      el("time-modification", undefined, [
        el("actual-notes", undefined, [String(event.duration.timeModification.actualNotes)]),
        el("normal-notes", undefined, [String(event.duration.timeModification.normalNotes)]),
      ]),
    );
  }

  if (event.kind === "note") {
    const notations: XmlChild[] = [];
    if (event.tie?.stop) notations.push(el("tied", { type: "stop" }));
    if (event.tie?.start) notations.push(el("tied", { type: "start" }));
    if (event.slur?.stop) notations.push(el("slur", { type: "stop", number: "1" }));
    if (event.slur?.start) notations.push(el("slur", { type: "start", number: "1" }));
    if (event.tuplet?.stop) notations.push(el("tuplet", { type: "stop", number: "1" }));
    if (event.tuplet?.start) notations.push(el("tuplet", { type: "start", number: "1" }));
    if (event.ornaments && event.ornaments.length) {
      notations.push(el("ornaments", undefined, event.ornaments.map(ornamentNode)));
    }
    if (event.fermata) notations.push(el("fermata"));
    if (notations.length) kids.push(el("notations", undefined, notations));

    if (event.lyrics && event.lyrics.length > 0) {
      const filtered = event.lyrics
        .filter((ly) => !verses || verses.includes(ly.verse))
        .sort((a, b) => a.verse - b.verse);
      filtered.forEach((ly, idx) => {
        const number = verses ? idx + 1 : ly.verse;
        const lyricKids: XmlChild[] = [
          el("syllabic", undefined, [ly.syllabic]),
          el("text", undefined, [ly.text]),
        ];
        if (ly.extend) lyricKids.push(el("extend"));
        kids.push(el("lyric", { number: String(number) }, lyricKids));
      });
    }
  }

  return el("note", undefined, kids);
}

function buildTempo(bpm: number): XmlNode {
  const value = String(Math.round(bpm));
  return el("direction", { placement: "above" }, [
    el("direction-type", undefined, [
      el("metronome", undefined, [
        el("beat-unit", undefined, ["quarter"]),
        el("per-minute", undefined, [value]),
      ]),
    ]),
    el("sound", { tempo: value }),
  ]);
}

/** MusicXML element name for each ornament (trill renders as <trill-mark/>). */
const ORNAMENT_ELEMENT: Record<Ornament, string> = {
  trill: "trill-mark",
  mordent: "mordent",
  "inverted-mordent": "inverted-mordent",
  turn: "turn",
  "inverted-turn": "inverted-turn",
};

function ornamentNode(ornament: Ornament): XmlNode {
  return el(ORNAMENT_ELEMENT[ornament]);
}

/** Words for a navigation jump (e.g. "D.S. al Coda"). Pure signs return undefined. */
function deriveNavigationWords(nav: NavigationDirection): string | undefined {
  if (nav.words) return nav.words;
  const suffix = nav.target === "fine" ? " al Fine" : nav.target === "coda" ? " al Coda" : "";
  if (nav.jump === "da-capo") return `D.C.${suffix}`;
  if (nav.jump === "dal-segno") return `D.S.${suffix}`;
  if (nav.fine) return "Fine";
  return undefined;
}

/**
 * Build a MusicXML <direction> for a dynamic and/or navigation marker. Returns
 * null when the direction carries no renderable content. Element order follows
 * the content model: direction-type+, offset?, sound?.
 */
function buildDirection(dir: Direction): XmlNode | null {
  const typeNodes: XmlNode[] = [];
  const soundAttrs: Record<string, string> = {};

  if (dir.dynamics) {
    typeNodes.push(el("direction-type", undefined, [el("dynamics", undefined, [el(dir.dynamics)])]));
  }

  const nav = dir.navigation;
  if (nav) {
    if (nav.sign === "segno") {
      typeNodes.push(el("direction-type", undefined, [el("segno")]));
      soundAttrs.segno = "1";
    }
    if (nav.sign === "coda") {
      typeNodes.push(el("direction-type", undefined, [el("coda")]));
      soundAttrs.coda = "1";
    }
    const words = deriveNavigationWords(nav);
    if (words) {
      typeNodes.push(el("direction-type", undefined, [el("words", undefined, [words])]));
    }
    if (nav.jump === "da-capo") soundAttrs.dacapo = "yes";
    if (nav.jump === "dal-segno") soundAttrs.dalsegno = "1";
    if (nav.fine) soundAttrs.fine = "yes";
  }

  if (dir.words) {
    typeNodes.push(el("direction-type", undefined, [el("words", undefined, [dir.words])]));
  }

  if (typeNodes.length === 0) return null;

  const placement = dir.placement ?? (dir.dynamics ? "below" : "above");
  const kids: XmlChild[] = [...typeNodes];
  if (dir.offsetDivisions && dir.offsetDivisions !== 0) {
    kids.push(el("offset", undefined, [String(dir.offsetDivisions)]));
  }
  if (Object.keys(soundAttrs).length) kids.push(el("sound", soundAttrs));
  return el("direction", { placement }, kids);
}

function buildHarmony(h: HarmonyChord, offsetDivisions: number): XmlNode {
  const rootKids: XmlChild[] = [el("root-step", undefined, [h.root.step])];
  if (h.root.alter !== undefined && h.root.alter !== 0) {
    rootKids.push(el("root-alter", undefined, [String(h.root.alter)]));
  }
  // The kind `text` carries ONLY the quality suffix; the root prints from <root>
  // and the bass from <bass>. (Empty suffix → omit text so just the root shows.)
  const suffix = deriveChordSuffix(h.kind);
  const kids: XmlChild[] = [
    el("root", undefined, rootKids),
    el("kind", suffix ? { text: suffix } : undefined, [h.kind]),
  ];
  if (h.bass) {
    const bassKids: XmlChild[] = [el("bass-step", undefined, [h.bass.step])];
    if (h.bass.alter !== undefined && h.bass.alter !== 0) {
      bassKids.push(el("bass-alter", undefined, [String(h.bass.alter)]));
    }
    kids.push(el("bass", undefined, bassKids));
  }
  // <offset> follows the chord spec in the MusicXML harmony content model.
  if (offsetDivisions !== 0) kids.push(el("offset", undefined, [String(offsetDivisions)]));
  return el("harmony", undefined, kids);
}

// ScoreIR uses the ergonomic alias "final"; MusicXML's <bar-style> has no such
// value — a final barline is "light-heavy" (the IR↔MusicXML boundary, ADR-001).
const BAR_STYLE_MUSICXML: Partial<Record<string, string>> = { final: "light-heavy" };

function buildBarline(barline: Barline): XmlNode {
  const kids: XmlChild[] = [];
  if (barline.style) {
    kids.push(el("bar-style", undefined, [BAR_STYLE_MUSICXML[barline.style] ?? barline.style]));
  }
  if (barline.ending) {
    kids.push(
      el("ending", {
        number: barline.ending.numbers.join(","),
        type: barline.ending.type,
      }),
    );
  }
  if (barline.repeat) {
    kids.push(
      el("repeat", {
        direction: barline.repeat.direction,
        times: barline.repeat.times,
      }),
    );
  }
  return el("barline", { location: barline.location }, kids);
}
