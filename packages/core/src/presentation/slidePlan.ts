/**
 * Presentation planner (PRD §STR-002, §RND-003).
 *
 * Expands the running order (verse/chorus/bridge ...) into concrete slides:
 *  - section boundaries always start a new slide,
 *  - measures are packed up to measuresPerSystem * maxSystemsPerSlide per slide,
 *  - a measure is never split across slides,
 *  - the chosen verse's lyrics are attached per slide.
 *
 * Deterministic: same (score, profile) -> same plan.
 */
import { orderedMeasures } from "../context.js";
import type { Measure, ScoreIR, ScoreSection } from "../types/scoreir.js";
import type {
  PresentationProfile,
  SlidePlan,
  SlidePlanSlide,
} from "../types/presentation.js";

export const SLIDE_PLAN_VERSION = "slideplan-0.1.0";

const SECTION_KIND_LABEL: Record<ScoreSection["kind"], string> = {
  intro: "Intro",
  verse: "Verse",
  preChorus: "Pre-Chorus",
  chorus: "Chorus",
  bridge: "Bridge",
  interlude: "Interlude",
  tag: "Tag",
  ending: "Ending",
  custom: "Section",
};

const SECTION_KIND_LABEL_KO: Record<ScoreSection["kind"], string> = {
  intro: "전주",
  verse: "절",
  preChorus: "프리코러스",
  chorus: "후렴",
  bridge: "브릿지",
  interlude: "간주",
  tag: "태그",
  ending: "후주",
  custom: "파트",
};

function sectionLabel(section: ScoreSection | undefined, verse: number | undefined, ko: boolean): string {
  if (!section) return ko ? "파트" : "Section";
  if (section.label) return section.label;
  const num = section.number ?? (section.kind === "verse" ? verse : undefined);
  if (ko) {
    if (section.kind === "verse" && num !== undefined) return `${num}절`;
    const base = SECTION_KIND_LABEL_KO[section.kind];
    return num !== undefined ? `${base} ${num}` : base;
  }
  const base = SECTION_KIND_LABEL[section.kind];
  return num !== undefined ? `${base} ${num}` : base;
}

/** A projection line longer than this is sub-split so the engraving stays large. */
const MAX_LINE_MEASURES = 4;

/** True if `measure` begins a new word (its first sung syllable is single/begin). */
function startsWord(measure: Measure, verse: number | undefined): boolean {
  for (const ev of measure.events) {
    if (ev.kind !== "note") continue;
    const lys = ev.lyrics ?? [];
    const ly = (verse !== undefined ? lys.find((l) => l.verse === verse) : undefined) ?? lys[0];
    if (ly) return ly.syllabic === "single" || ly.syllabic === "begin" || ly.syllabic == null;
  }
  return true; // no lyric here → a safe place to break
}

/**
 * Split a long phrase line into a few compact, roughly-even sub-lines so a wide
 * phrase renders as a large, readable engraving instead of one tiny full-width
 * row. Each break lands on an even division, snapped to a word boundary when one
 * sits within a measure of it (so words stay whole); otherwise it breaks on the
 * beat, where the syllable hyphen marks the carry-over (standard engraving).
 */
function splitLongLine(line: Measure[], verse: number | undefined): Measure[][] {
  if (line.length <= MAX_LINE_MEASURES) return [line];
  const parts = Math.ceil(line.length / MAX_LINE_MEASURES);
  const out: Measure[][] = [];
  let start = 0;
  for (let p = 1; p < parts; p++) {
    const ideal = Math.round((line.length * p) / parts);
    let brk = ideal;
    for (const d of [0, -1, 1]) {
      const i = ideal + d;
      if (i > start && i < line.length && startsWord(line[i]!, verse)) {
        brk = i;
        break;
      }
    }
    if (brk > start) {
      out.push(line.slice(start, brk));
      start = brk;
    }
  }
  out.push(line.slice(start));
  return out;
}

export function planPresentation(score: ScoreIR, profile: PresentationProfile): SlidePlan {
  const ordered = orderedMeasures(score);
  const ko = score.metadata.language?.toLowerCase().startsWith("ko") ?? false;
  const indexById = new Map(ordered.map((m) => [m.id, m.index] as const));
  const sectionById = new Map(score.sections.map((s) => [s.id, s] as const));

  const measuresOfSection = (sectionId: string) => {
    const section = sectionById.get(sectionId);
    if (!section) return [];
    const start = indexById.get(section.startMeasureId);
    const end = indexById.get(section.endMeasureId);
    if (start === undefined || end === undefined) return [];
    const [lo, hi] = start <= end ? [start, end] : [end, start];
    return ordered.filter((m) => m.index >= lo && m.index <= hi);
  };

  const projection = profile.layout === "projection";
  const perSlide = Math.max(1, profile.measuresPerSystem * profile.maxSystemsPerSlide);
  // Projection: each slide holds up to this many sung lines (phrases).
  const linesPerSlide = Math.max(1, profile.maxSystemsPerSlide);

  /** Split a section's measures into slide chunks (+ per-line system breaks). */
  const chunksFor = (measures: Measure[], verse: number | undefined): { ids: string[]; breaks: string[] }[] => {
    if (!projection) {
      const out: { ids: string[]; breaks: string[] }[] = [];
      for (let o = 0; o < measures.length; o += perSlide) {
        out.push({ ids: measures.slice(o, o + perSlide).map((m) => m.id), breaks: [] });
      }
      return out;
    }
    // Group measures into lines at `systemBreak` markers (last measure also ends
    // a line), sub-split any over-long phrase so the engraving stays large, then
    // pack `linesPerSlide` lines per slide.
    const phrases: Measure[][] = [];
    let cur: Measure[] = [];
    for (const m of measures) {
      cur.push(m);
      if (m.systemBreak) {
        phrases.push(cur);
        cur = [];
      }
    }
    if (cur.length) phrases.push(cur);
    const lines = phrases.flatMap((p) => splitLongLine(p, verse));
    const out: { ids: string[]; breaks: string[] }[] = [];
    for (let i = 0; i < lines.length; i += linesPerSlide) {
      const group = lines.slice(i, i + linesPerSlide);
      out.push({
        ids: group.flat().map((m) => m.id),
        breaks: group.slice(1).map((line) => line[0]!.id),
      });
    }
    return out;
  };

  const slides: SlidePlanSlide[] = [];
  let slideIndex = 0;
  let titleEmitted = false;

  for (const item of score.presentation.order) {
    if (item.hidden) continue;
    const section = sectionById.get(item.sectionId);
    const measures = measuresOfSection(item.sectionId);
    if (measures.length === 0) continue;

    const repeats = Math.max(1, item.repeatCount ?? 1);
    for (let r = 0; r < repeats; r++) {
      for (const chunk of chunksFor(measures, item.verse)) {
        const slide: SlidePlanSlide = {
          index: slideIndex++,
          measureIds: chunk.ids,
        };
        if (chunk.breaks.length > 0) slide.systemBreakMeasureIds = chunk.breaks;
        if (item.verse !== undefined) slide.verse = item.verse;
        if (profile.sectionLabelVisibility) {
          slide.sectionLabel = item.label ?? sectionLabel(section, item.verse, ko);
        }
        if (profile.titleVisibility === "every-slide" || (profile.titleVisibility === "first-slide" && !titleEmitted)) {
          if (score.metadata.title) slide.title = score.metadata.title;
          titleEmitted = true;
        }
        slides.push(slide);
      }
    }
  }

  return {
    planVersion: SLIDE_PLAN_VERSION,
    profileVersion: profile.version,
    profile,
    slides,
  };
}
