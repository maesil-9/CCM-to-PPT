/**
 * buildPresentation — the reusable score→PPTX build engine shared by the CLI
 * (and, later, the web system). Given a ScoreIR and per-score build options
 * (chords on/off, transpose, background image, output styling), it runs the
 * full deterministic chain and returns the PPTX, its validation, the slide
 * plan, and per-slide assets.
 *
 * One Verovio loadData per slide produces both SVG and PNG. Adapters are loaded
 * lazily, so a web caller that injects its own renderer/builder never pulls the
 * Node-only engines.
 */
import {
  DEFAULT_BUILD_OPTIONS,
  DEFAULT_PRESENTATION_PROFILE,
  planPresentation,
  prepareScore,
  serializeMusicXml,
  transposeScore,
  validateScore,
  type BuildOptions,
  type GeneratedPptx,
  type PptxBuilder,
  type PptxProfile,
  type PptxSlideSpec,
  type PresentationProfile,
  type RendererProvider,
  type RenderOptions,
  type ScoreIR,
  type ScoreValidationResult,
  type SlidePlan,
} from "@worship-score/core";
import { defaultFontConfig, fontEmbedFromConfig, BUNDLED_FONT_FAMILY } from "./fonts.js";

export interface SlideAsset {
  index: number;
  png: Uint8Array;
  svg: string;
  musicXml: string;
  widthPx: number;
  heightPx: number;
  sectionLabel?: string;
  verse?: number;
  /** Congregation lyric text, one entry per sung line (projection subtitle). */
  lyricLines?: string[];
}

export interface FontConfig {
  /** Pin the lyric/chord text font for deterministic rasterization. */
  textFontFamily?: string;
  /** Embeddable font files; when set, rasterization is cross-machine deterministic. */
  fontFiles?: string[];
}

export interface BuildPresentationInput {
  score: ScoreIR;
  options?: Partial<BuildOptions>;
  profile?: PresentationProfile;
  fonts?: FontConfig;
  /**
   * Embed the text font into the PPTX so native title/labels are portable to
   * machines without the font (opt-in; embeds the full font → larger file).
   * Score lyrics are rasterized regardless, so they are always self-contained.
   */
  embedFonts?: boolean;
  /** Emit the full-score MusicXML in the result (CLI writes it). Default true. */
  emitFullMusicXml?: boolean;
  /** Reuse a renderer/builder across many builds (e.g. a web server). */
  renderer?: RendererProvider;
  builder?: PptxBuilder;
}

export interface BuildPresentationResult {
  pptx: GeneratedPptx;
  validation: Awaited<ReturnType<PptxBuilder["validate"]>>;
  scoreValidation: ScoreValidationResult;
  slidePlan: SlidePlan;
  assets: SlideAsset[];
  /** Present when emitFullMusicXml !== false. */
  musicXml: string;
  /** The score after transpose was applied (or the input if none). */
  resolvedScore: ScoreIR;
}

function resolveOptions(options?: Partial<BuildOptions>): BuildOptions {
  return {
    tempo: { visible: options?.tempo?.visible ?? true },
    chords: { ...DEFAULT_BUILD_OPTIONS.chords, ...options?.chords },
    key: { ...DEFAULT_BUILD_OPTIONS.key, ...options?.key },
    ...(options?.background ? { background: options.background } : {}),
    ...(options?.style ? { style: options.style } : {}),
    ...(options?.score ? { score: options.score } : {}),
  };
}

function toPptxProfile(profile: PresentationProfile, options: BuildOptions): PptxProfile {
  const p: PptxProfile = {
    slideWidthInches: profile.slideWidthInches,
    slideHeightInches: profile.slideHeightInches,
    safeMarginInches: profile.safeMarginInches,
  };
  if (options.style?.backgroundColor) p.background = options.style.backgroundColor;
  if (options.style?.card) p.card = options.style.card;
  if (options.style?.title) p.title = options.style.title;
  if (options.style?.sectionLabel) p.sectionLabel = options.style.sectionLabel;
  if (options.style?.textShadow) p.textShadow = true;
  if (profile.layout === "projection") p.compact = true;
  if (options.score?.lyricFont) p.lyricFontFace = options.score.lyricFont;
  if (options.background) {
    p.backgroundImage = { data: options.background.data, mime: options.background.mime };
  }
  return p;
}

// --- Projection auto-sizing (maximum readable zoom) ---
// We render every projection slide on ONE fixed-width page so all PNGs share a
// width and a single composite scale gives identical note size deck-wide. To make
// that size as LARGE as possible without a line wrapping to a second page, we
// measure each deck's widest natural line and size the page so it just fills the
// content area. This is an engine rule (per deck), not a hardcoded number.
const PROJECTION_FALLBACK_PAGE_WIDTH = 2400; // used only if measuring is unavailable
// A page wide enough that no realistic worship line wraps during measuring; with
// adjustPageWidth the page is then cropped to the true content (incl. lyric overhang).
const PROJECTION_MEASURE_PAGE_WIDTH = 4800;
// Slack added to the widest line so it fills the content WITHOUT wrapping (the
// measured width already includes lyric overhang, so a few percent is plenty).
const PROJECTION_FILL_SLACK = 0.03;
// Verovio's definition-scale maps page units → internal units ×10, and our fixed
// 60-unit L/R page margins (see buildVerovioOptions) are 600 internal each.
const PROJECTION_UNIT_SCALE = 10;
const PROJECTION_MARGIN_INTERNAL_TOTAL = 1200;

/**
 * True content width of an `adjustPageWidth` render in internal units (incl. any
 * lyric overhang past the staff): the cropped inner page width minus the
 * symmetric L/R page margins. Returns 0 when the geometry can't be parsed.
 */
function pageContentWidth(svg: string): number {
  const innerW = parseFloat(/<svg class="definition-scale"[^>]*viewBox="0 0 ([\d.]+) /.exec(svg)?.[1] ?? "0");
  const leftMargin = parseFloat(/<g class="page-margin"[^>]*translate\(([\d.]+)/.exec(svg)?.[1] ?? "0");
  return innerW > 0 && leftMargin > 0 ? innerW - 2 * leftMargin : 0;
}

/**
 * Page width (Verovio page units) that makes the deck's widest natural line fill
 * the content area with a small wrap-safety slack — the maximum readable zoom for
 * this deck. `maxContentWidth` is the largest pageContentWidth() across the deck
 * (internal units). Falls back to the default when no width was measured.
 */
function fitProjectionPageWidth(maxContentWidth: number): number {
  if (!(maxContentWidth > 0)) return PROJECTION_FALLBACK_PAGE_WIDTH;
  const innerW = maxContentWidth * (1 + PROJECTION_FILL_SLACK) + PROJECTION_MARGIN_INTERNAL_TOTAL;
  return Math.max(1, Math.round(innerW / PROJECTION_UNIT_SCALE));
}

function renderOptionsFor(
  profile: PresentationProfile,
  options: BuildOptions,
  fonts?: FontConfig,
): RenderOptions {
  const projection = profile.layout === "projection";
  // Projection defaults that match real worship-PPT readability: a heavier ink so
  // staff/stems survive on a screen+background, and a near-black that aligns the
  // CLI/PPTX output with the web editor's default (#1a1a1a).
  const inkColor = options.score?.inkColor ?? (projection ? "1A1A1A" : undefined);
  const lineThickness = options.score?.lineThickness ?? (projection ? 1.7 : undefined);
  return {
    // Projection rasterises at 3× so the (globally up-scaled) staff/lyrics stay
    // crisp on a 1080p+ sanctuary screen; leadsheet stays 2×.
    scale: projection ? 3 : 2,
    encodedBreaks: true,
    // Projection: keep every line at its NATURAL width (no forced full-width
    // stretch) — lines may differ in length, like a real lead sheet. Do NOT crop
    // the page width: every slide keeps the SAME fixed-width page canvas, so all
    // PNGs share one width and the compositor's single global scale makes the
    // staff/note size identical on every slide AND fills the content box width
    // (line 1 → left margin, line 2 → right margin via rightAlignTrailingSystems).
    ...(projection ? { noJustification: true, rightAlignTrailingSystems: true } : {}),
    // Projection: a FIXED page width (constant across slides → equal-width PNGs →
    // one global composite scale = identical note size on every slide). The value
    // here is only a FALLBACK: buildPresentation measures the deck's widest natural
    // line and tightens pageWidth so that line just fills the content (maximum
    // readable zoom), uniform across slides — see fitProjectionPageWidth().
    // Leadsheet keeps a constant per-measure width.
    pageWidth: projection ? PROJECTION_FALLBACK_PAGE_WIDTH : Math.max(900, profile.measuresPerSystem * 620),
    // Projection: modest linear spread; lower non-linear so runs of short notes
    // (eighths/melisma) distribute evenly instead of cramming (kills the
    // "highly compressed 0.57" warning). spacingLinear/NonLinear = horizontal;
    // spacingSystem/spacingStaff = vertical gaps between sung lines.
    ...(projection
      ? { rendererOptions: { spacingLinear: 0.62, spacingNonLinear: 0.6, spacingSystem: 18, spacingStaff: 4 } }
      : {}),
    ...(profile.minimumStaffSize ? { minStaffSize: profile.minimumStaffSize } : {}),
    ...(profile.lyricSize ? { lyricSize: profile.lyricSize } : {}),
    // Measure numbers: shown for leadsheet, hidden for projection (unless overridden).
    ...((options.measureNumbers?.visible ?? !projection) ? {} : { hideMeasureNumbers: true }),
    ...(inkColor ? { inkColor } : {}),
    ...(lineThickness ? { lineThickness } : {}),
    ...(options.score?.lyricBold ? { lyricBold: true } : {}),
    ...(options.score?.lyricColor ? { lyricColor: options.score.lyricColor } : {}),
    ...(options.score?.lyricOutlineColor ? { lyricOutlineColor: options.score.lyricOutlineColor } : {}),
    ...(options.score?.lyricOutlineWidth !== undefined ? { lyricOutlineWidth: options.score.lyricOutlineWidth } : {}),
    ...(options.score?.lyricShadow ? { lyricShadow: true } : {}),
    ...(options.score?.lyricGap !== undefined ? { lyricTopMargin: options.score.lyricGap } : {}),
    // Lyric font: a user choice overrides the bundled default and (if it is not
    // the bundled Pretendard) enables system fonts so resvg can find it.
    ...(options.score?.lyricFont
      ? { textFontFamily: options.score.lyricFont, ...(options.score.lyricFont !== BUNDLED_FONT_FAMILY ? { loadSystemFonts: true } : {}) }
      : fonts?.textFontFamily
        ? { textFontFamily: fonts.textFontFamily }
        : {}),
    ...(fonts?.fontFiles ? { fontFiles: fonts.fontFiles } : {}),
  };
}


/**
 * Join a run of lyric syllables into readable words. A space precedes each
 * syllable that STARTS a word (syllabic "single"/"begin", or — when the score
 * carries no word-boundary data — every syllable, which degrades to one space
 * per syllable). "middle"/"end" continue the current word with no space. This is
 * the standard MusicXML mechanism for word grouping, so a properly-transcribed
 * score yields "인자야 이 뼈들이" rather than "인 자 야 이 뼈 들 이".
 */
function joinSyllables(syllables: { text: string; syllabic?: string }[]): string {
  let out = "";
  for (const s of syllables) {
    const startsWord = s.syllabic === "single" || s.syllabic === "begin" || s.syllabic == null;
    if (out && startsWord) out += " ";
    out += s.text;
  }
  return out;
}

/**
 * Congregation lyric text per sung line for a projection slide: walk the slide's
 * measures in order, take each note's lyric for the slide's verse (falling back
 * to the first), group syllables into words via `syllabic`, and split into lines
 * at the explicit phrase breaks.
 */
function lyricLinesForSlide(
  measureById: Map<string, ScoreIR["measures"][number]>,
  slide: { measureIds: string[]; systemBreakMeasureIds?: string[]; verse?: number },
): string[] {
  const verse = slide.verse ?? 1;
  const breaks = new Set(slide.systemBreakMeasureIds ?? []);
  const lines: string[] = [];
  let cur: { text: string; syllabic?: string }[] = [];
  for (const id of slide.measureIds) {
    if (breaks.has(id) && cur.length) {
      lines.push(joinSyllables(cur));
      cur = [];
    }
    for (const ev of measureById.get(id)?.events ?? []) {
      if (ev.kind !== "note") continue;
      const lys = ev.lyrics ?? [];
      const ly = lys.find((l) => l.verse === verse) ?? lys[0];
      if (ly?.text) cur.push({ text: ly.text, ...(ly.syllabic ? { syllabic: ly.syllabic } : {}) });
    }
  }
  if (cur.length) lines.push(joinSyllables(cur));
  return lines;
}

/** Map items through `fn` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

export async function buildPresentation(input: BuildPresentationInput): Promise<BuildPresentationResult> {
  const options = resolveOptions(input.options);
  const profile = input.profile ?? DEFAULT_PRESENTATION_PROFILE;
  const emitFullMusicXml = input.emitFullMusicXml ?? true;
  // Default to the bundled Korean-capable font so lyrics rasterize identically
  // on any machine. A caller can pass `fonts: {}` to opt back into system fonts.
  const fonts = input.fonts ?? defaultFontConfig();

  const resolvedScore =
    options.key.transposeSemitones !== 0
      ? transposeScore(input.score, options.key.transposeSemitones)
      : input.score;

  const scoreValidation = validateScore(resolvedScore);
  if (scoreValidation.hasBlocking) {
    const blocking = scoreValidation.issues.filter((i) => i.severity === "error" || i.severity === "fatal");
    throw new Error(
      `음악 검증 실패(${blocking.length}건 error/fatal): ${blocking.map((b) => `${b.code}@${b.measureId ?? b.entityId ?? "?"}`).join(", ")}`,
    );
  }

  const slidePlan = planPresentation(resolvedScore, profile);
  if (slidePlan.slides.length === 0) {
    throw new Error("생성할 슬라이드가 없습니다 — 악보 마디·섹션·발표순서(presentation.order)를 확인하세요.");
  }
  const MAX_SLIDES = 300;
  if (slidePlan.slides.length > MAX_SLIDES) {
    throw new Error(`슬라이드가 너무 많습니다(${slidePlan.slides.length} > ${MAX_SLIDES}) — 반복 횟수·구성을 확인하세요.`);
  }
  const prepared = prepareScore(resolvedScore);
  let renderOptions = renderOptionsFor(profile, options, fonts);

  const ownsRenderer = !input.renderer;
  let renderer = input.renderer;
  if (!renderer) {
    const { VerovioRenderer } = await import("@worship-score/adapters");
    renderer = await VerovioRenderer.create();
  }
  const activeRenderer = renderer;

  try {
    // Render slides in parallel up to the renderer's safe concurrency (1 for a
    // single toolkit, pool size for a worker pool) — preserving slide order.
    const concurrency = Math.max(1, activeRenderer.maxConcurrency ?? 1);

    // Per-slide MusicXML (deterministic), shared by the measuring and render passes.
    const serializeSlide = (slide: SlidePlan["slides"][number]): string =>
      serializeMusicXml(resolvedScore, {
        prepared,
        measureIds: slide.measureIds,
        includeChords: options.chords.visible,
        includeTempo: options.tempo?.visible !== false,
        // Part label ("Melody"): shown for leadsheet, hidden for projection.
        suppressPartName: !(options.partName?.visible ?? profile.layout !== "projection"),
        // Projection slides are a linear sing-along order; hide jump navigation
        // (repeats, 1./2. endings, segno, D.S., Fine) so the congregation never
        // has to follow a jump.
        ...(profile.layout === "projection" ? { hideNavigation: true } : {}),
        // Projection: explicit per-phrase breaks (empty = one full-width line).
        // Leadsheet: wrap every N measures.
        ...(profile.layout === "projection"
          ? { systemBreakBefore: slide.systemBreakMeasureIds ?? [] }
          : { systemBreakEvery: profile.measuresPerSystem }),
        ...(slide.verse !== undefined ? { verses: [slide.verse] } : {}),
      });

    // Projection: measure the deck's widest natural line (cheap SVG pass, no
    // rasterization; adjustPageWidth crops to true content incl. lyric overhang)
    // and tighten the page so that line just fills it — the maximum readable zoom,
    // identical on every slide. This guarantees no line wraps (content > measured
    // width) so the one-page render stays safe.
    if (profile.layout === "projection") {
      const measureOptions: RenderOptions = {
        ...renderOptions,
        pageWidth: PROJECTION_MEASURE_PAGE_WIDTH,
        adjustPageWidth: true,
      };
      const widths = await mapWithConcurrency(slidePlan.slides, concurrency, async (slide) => {
        const r = await activeRenderer.renderScore({ musicXml: serializeSlide(slide), outputMode: "svg", options: measureOptions });
        return pageContentWidth(r.pages[0]?.svg ?? "");
      });
      renderOptions = { ...renderOptions, pageWidth: fitProjectionPageWidth(Math.max(0, ...widths)) };
    }

    const rendered = await mapWithConcurrency(slidePlan.slides, concurrency, async (slide) => {
      const xml = serializeSlide(slide);
      // One loadData → both PNG (embedded) and SVG (asset).
      const result = await activeRenderer.renderScore({ musicXml: xml, outputMode: "png", options: renderOptions });
      const page = result.pages[0];
      if (!page?.png) throw new Error(`슬라이드 ${slide.index} PNG 렌더 실패`);
      return { slide, xml, png: page.png, svg: page.svg ?? "", widthPx: page.widthPx, heightPx: page.heightPx };
    });

    const assets: SlideAsset[] = [];
    const slideSpecs: PptxSlideSpec[] = [];
    const measureById = new Map(resolvedScore.measures.map((m) => [m.id, m] as const));
    const wantLyrics = profile.layout === "projection";
    for (const { slide, xml, png, svg, widthPx, heightPx } of rendered) {
      const lyricLines = wantLyrics ? lyricLinesForSlide(measureById, slide) : [];
      assets.push({
        index: slide.index,
        png,
        svg,
        musicXml: xml,
        widthPx,
        heightPx,
        ...(slide.sectionLabel ? { sectionLabel: slide.sectionLabel } : {}),
        ...(slide.verse !== undefined ? { verse: slide.verse } : {}),
        ...(lyricLines.length ? { lyricLines } : {}),
      });
      const spec: PptxSlideSpec = {
        index: slide.index,
        image: { data: png, mime: "image/png", widthPx, heightPx },
      };
      if (slide.title) spec.title = slide.title;
      if (slide.sectionLabel) spec.sectionLabel = slide.sectionLabel;
      if (lyricLines.length) spec.lyricLines = lyricLines;
      slideSpecs.push(spec);
    }

    const builder = input.builder ?? new (await import("@worship-score/adapters")).PptxGenJsBuilder();
    const fontEmbed = input.embedFonts ? fontEmbedFromConfig(fonts) : undefined;
    const pptx = await builder.generate({
      metadata: {
        ...(resolvedScore.metadata.title ? { title: resolvedScore.metadata.title } : {}),
        ...(resolvedScore.metadata.copyright ? { copyright: resolvedScore.metadata.copyright } : {}),
      },
      profile: toPptxProfile(profile, options),
      slides: slideSpecs,
      ...(fontEmbed ? { fontEmbed } : {}),
    });
    const validation = await builder.validate({ buffer: pptx.buffer, expectedSlideCount: pptx.slideCount });

    return {
      pptx,
      validation,
      scoreValidation,
      slidePlan,
      assets,
      musicXml: emitFullMusicXml
        ? serializeMusicXml(resolvedScore, { prepared, includeChords: options.chords.visible, includeTempo: options.tempo?.visible !== false })
        : "",
      resolvedScore,
    };
  } finally {
    if (ownsRenderer) await renderer.dispose?.();
  }
}
