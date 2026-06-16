/**
 * buildPresentation — the reusable score→PPTX build engine shared by the CLI
 * (and, later, the web system). Given a ScoreIR and per-score build options
 * (chords on/off, transpose, background image, output styling), it runs the
 * full deterministic chain and returns the PPTX, its validation, the slide
 * plan, and per-slide assets.
 */
import {
  DEFAULT_BUILD_OPTIONS,
  DEFAULT_PRESENTATION_PROFILE,
  planPresentation,
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
  type ScoreIR,
  type ScoreValidationResult,
  type SlidePlan,
} from "@worship-score/core";
import { PptxGenJsBuilder, VerovioRenderer } from "@worship-score/adapters";

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

export interface BuildPresentationInput {
  score: ScoreIR;
  options?: Partial<BuildOptions>;
  profile?: PresentationProfile;
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
  musicXml: string;
  /** The score after transpose was applied (or the input if none). */
  resolvedScore: ScoreIR;
}

function resolveOptions(options?: Partial<BuildOptions>): BuildOptions {
  return {
    chords: { ...DEFAULT_BUILD_OPTIONS.chords, ...options?.chords },
    key: { ...DEFAULT_BUILD_OPTIONS.key, ...options?.key },
    ...(options?.background ? { background: options.background } : {}),
    ...(options?.style ? { style: options.style } : {}),
  };
}

function toPptxProfile(profile: PresentationProfile, options: BuildOptions): PptxProfile {
  const p: PptxProfile = {
    slideWidthInches: profile.slideWidthInches,
    slideHeightInches: profile.slideHeightInches,
    safeMarginInches: profile.safeMarginInches,
  };
  if (options.style?.backgroundColor) p.background = options.style.backgroundColor;
  if (options.style?.cardColor) p.cardColor = options.style.cardColor;
  if (options.style?.title) p.title = options.style.title;
  if (options.style?.sectionLabel) p.sectionLabel = options.style.sectionLabel;
  if (options.background) {
    p.backgroundImage = { data: options.background.data, mime: options.background.mime };
    p.scoreScrim = options.background.scrim;
  }
  return p;
}

export async function buildPresentation(input: BuildPresentationInput): Promise<BuildPresentationResult> {
  const options = resolveOptions(input.options);
  const profile = input.profile ?? DEFAULT_PRESENTATION_PROFILE;

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
  const renderer = input.renderer ?? (await VerovioRenderer.create());

  const assets: SlideAsset[] = [];
  const slideSpecs: PptxSlideSpec[] = [];

  for (const slide of slidePlan.slides) {
    const xml = serializeMusicXml(resolvedScore, {
      measureIds: slide.measureIds,
      includeChords: options.chords.visible,
      ...(slide.verse !== undefined ? { verses: [slide.verse] } : {}),
    });

    const png = await renderer.renderScore({ musicXml: xml, outputMode: "png", options: { scale: 2 } });
    const page = png.pages[0];
    if (!page?.png) throw new Error(`슬라이드 ${slide.index} PNG 렌더 실패`);
    const svgResult = await renderer.renderScore({ musicXml: xml, outputMode: "svg" });
    const svg = svgResult.pages[0]?.svg ?? "";

    assets.push({
      index: slide.index,
      png: page.png,
      svg,
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

  const builder = input.builder ?? new PptxGenJsBuilder();
  const pptx = await builder.generate({
    metadata: {
      ...(resolvedScore.metadata.title ? { title: resolvedScore.metadata.title } : {}),
      ...(resolvedScore.metadata.copyright ? { copyright: resolvedScore.metadata.copyright } : {}),
    },
    profile: toPptxProfile(profile, options),
    slides: slideSpecs,
  });
  const validation = await builder.validate({ buffer: pptx.buffer, expectedSlideCount: pptx.slideCount });

  return {
    pptx,
    validation,
    scoreValidation,
    slidePlan,
    assets,
    musicXml: serializeMusicXml(resolvedScore, { includeChords: options.chords.visible }),
    resolvedScore,
  };
}
