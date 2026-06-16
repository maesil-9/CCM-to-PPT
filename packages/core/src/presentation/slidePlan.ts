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
import type { ScoreIR, ScoreSection } from "../types/scoreir.js";
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

  const perSlide = Math.max(1, profile.measuresPerSystem * profile.maxSystemsPerSlide);
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
      for (let offset = 0; offset < measures.length; offset += perSlide) {
        const chunk = measures.slice(offset, offset + perSlide);
        const slide: SlidePlanSlide = {
          index: slideIndex++,
          measureIds: chunk.map((m) => m.id),
        };
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
