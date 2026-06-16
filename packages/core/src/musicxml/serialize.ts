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
import { eventDurationDivisions } from "../duration.js";
import type {
  Barline,
  Clef,
  Key,
  Measure,
  ScoreEvent,
  ScoreIR,
  Time,
} from "../types/scoreir.js";
import { el, renderDocument, type XmlChild, type XmlNode } from "./xml.js";

const MUSICXML_DOCTYPE =
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';

export interface SerializeOptions {
  /** Restrict output to these measure ids (in score order). */
  measureIds?: string[];
  /** Restrict lyrics to these verses, renumbered 1..n in output. */
  verses?: number[];
}

export function serializeMusicXml(score: ScoreIR, options: SerializeOptions = {}): string {
  const active = computeActiveAttributes(score);
  const ordered = orderedMeasures(score);
  const selected = options.measureIds
    ? ordered.filter((m) => options.measureIds!.includes(m.id))
    : ordered;

  const measureNodes: XmlNode[] = selected.map((measure, emittedIndex) => {
    const ctx = active.get(measure.id);
    if (!ctx) throw new Error(`No active attributes for measure ${measure.id}`);
    const children: XmlChild[] = [];

    const attrNode = buildAttributes(measure, ctx, emittedIndex === 0);
    if (attrNode) children.push(attrNode);

    for (const event of measure.events) {
      children.push(buildNote(event, ctx.divisions, options.verses));
    }
    for (const barline of measure.barlines ?? []) {
      children.push(buildBarline(barline));
    }

    return el("measure", { number: String(measure.number) }, children);
  });

  const part = el("part", { id: "P1" }, measureNodes);
  const partList = el("part-list", undefined, [
    el("score-part", { id: "P1" }, [
      el("part-name", undefined, [score.parts[0]?.name ?? "Melody"]),
    ]),
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

  if (event.kind === "note") {
    const notations: XmlChild[] = [];
    if (event.tie?.stop) notations.push(el("tied", { type: "stop" }));
    if (event.tie?.start) notations.push(el("tied", { type: "start" }));
    if (event.slur?.stop) notations.push(el("slur", { type: "stop", number: "1" }));
    if (event.slur?.start) notations.push(el("slur", { type: "start", number: "1" }));
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

function buildBarline(barline: Barline): XmlNode {
  const kids: XmlChild[] = [];
  if (barline.style) kids.push(el("bar-style", undefined, [barline.style]));
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
