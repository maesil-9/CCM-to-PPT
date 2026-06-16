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
import { defaultFontConfig, fontEmbedFromConfig } from "./fonts.js";

export interface SlideAsset {
  index: number;
  png: Uint8Array;
  svg: string;
  musicXml: string;
  widthPx: number;
  heightPx: number;
  sectionLabel?: string;
  verse?: number;
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
  if (options.background) {
    p.backgroundImage = { data: options.background.data, mime: options.background.mime };
  }
  return p;
}

function renderOptionsFor(
  profile: PresentationProfile,
  options: BuildOptions,
  fonts?: FontConfig,
): RenderOptions {
  const projection = profile.layout === "projection";
  return {
    scale: 2,
    encodedBreaks: true,
    // Projection lines hold a whole sung phrase, so use a wide page and spread
    // notes out (spacingLinear) to give the large lyrics room. Leadsheet keeps a
    // constant per-measure width.
    pageWidth: projection ? 2400 : Math.max(900, profile.measuresPerSystem * 620),
    ...(projection ? { rendererOptions: { spacingLinear: 0.8, spacingNonLinear: 0.7 } } : {}),
    ...(profile.minimumStaffSize ? { minStaffSize: profile.minimumStaffSize } : {}),
    ...(profile.lyricSize ? { lyricSize: profile.lyricSize } : {}),
    ...(options.score?.inkColor ? { inkColor: options.score.inkColor } : {}),
    ...(options.score?.lineThickness ? { lineThickness: options.score.lineThickness } : {}),
    ...(fonts?.textFontFamily ? { textFontFamily: fonts.textFontFamily } : {}),
    ...(fonts?.fontFiles ? { fontFiles: fonts.fontFiles } : {}),
  };
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
  const renderOptions = renderOptionsFor(profile, options, fonts);

  const ownsRenderer = !input.renderer;
  let renderer = input.renderer;
  if (!renderer) {
    const { VerovioRenderer } = await import("@worship-score/adapters");
    renderer = await VerovioRenderer.create();
  }

  try {
    const assets: SlideAsset[] = [];
    const slideSpecs: PptxSlideSpec[] = [];

    for (const slide of slidePlan.slides) {
      const xml = serializeMusicXml(resolvedScore, {
        prepared,
        measureIds: slide.measureIds,
        includeChords: options.chords.visible,
        includeTempo: options.tempo?.visible !== false,
        // Projection: explicit per-phrase breaks (empty = one full-width line).
        // Leadsheet: wrap every N measures.
        ...(profile.layout === "projection"
          ? { systemBreakBefore: slide.systemBreakMeasureIds ?? [] }
          : { systemBreakEvery: profile.measuresPerSystem }),
        ...(slide.verse !== undefined ? { verses: [slide.verse] } : {}),
      });

      // One loadData → both PNG (embedded) and SVG (asset).
      const rendered = await renderer.renderScore({ musicXml: xml, outputMode: "png", options: renderOptions });
      const page = rendered.pages[0];
      if (!page?.png) throw new Error(`슬라이드 ${slide.index} PNG 렌더 실패`);

      assets.push({
        index: slide.index,
        png: page.png,
        svg: page.svg ?? "",
        musicXml: xml,
        widthPx: page.widthPx,
        heightPx: page.heightPx,
        ...(slide.sectionLabel ? { sectionLabel: slide.sectionLabel } : {}),
        ...(slide.verse !== undefined ? { verse: slide.verse } : {}),
      });

      const spec: PptxSlideSpec = {
        index: slide.index,
        image: { data: page.png, mime: "image/png", widthPx: page.widthPx, heightPx: page.heightPx },
      };
      if (slide.title) spec.title = slide.title;
      if (slide.sectionLabel) spec.sectionLabel = slide.sectionLabel;
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
