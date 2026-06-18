/**
 * Provider interfaces (PRD §12.3, §9 of the implementation prompt).
 *
 * The domain depends only on these interfaces — never on Verovio, PptxGenJS,
 * an OMR engine, or any SDK directly. Concrete adapters live in
 * `@worship-score/adapters`. Each provider result records the provider name,
 * version, and a run id for traceability.
 */
import type { CardStyle, TextStyle } from "./build.js";

export interface ProviderHealth {
  ok: boolean;
  providerName: string;
  providerVersion: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// RendererProvider (PRD §RND-001/002)
// ---------------------------------------------------------------------------

export type RenderOutputMode = "svg" | "png";

export interface RenderOptions {
  /** Rasterization scale for PNG output (>1 upscales for crisper PNG). */
  scale?: number;
  /** Page width/height in Verovio units (1/100 mm). */
  pageWidth?: number;
  pageHeight?: number;
  /** Let the renderer shrink page height to content. */
  adjustPageHeight?: boolean;
  /** Honour encoded system breaks (`<print new-system>`) instead of auto layout. */
  encodedBreaks?: boolean;
  /** Minimum staff size hint. */
  minStaffSize?: number;
  /** Lyric font size in Verovio points (2–8). Large for projection subtitles. */
  lyricSize?: number;
  /** Remove auto-generated measure numbers from the engraving. */
  hideMeasureNumbers?: boolean;
  /** Also load system fonts during rasterization (for a user-chosen lyric font). */
  loadSystemFonts?: boolean;
  /** Justify the LAST/only system to full width too (projection: every line fills). */
  justifyLastSystem?: boolean;
  /** Disable horizontal justification entirely — each line keeps its natural width. */
  noJustification?: boolean;
  /** Crop the page width to the engraved content (tight PNG, no trailing space). */
  adjustPageWidth?: boolean;
  /** Right-align every line after the first (line 1 left, line 2 flush right). */
  rightAlignTrailingSystems?: boolean;
  /** Bold the congregation lyrics. */
  lyricBold?: boolean;
  /** Lyric fill colour (overrides ink for lyrics only), hex without '#'. */
  lyricColor?: string;
  /** Gap between staff and lyrics (Verovio lyricTopMinMargin units). */
  lyricTopMargin?: number;
  /** Lyric outline (halo/keyline) colour, hex without '#'. */
  lyricOutlineColor?: string;
  /** Lyric outline width as a percentage of glyph height (e.g. 4 = 4%). */
  lyricOutlineWidth?: number;
  /** Draw a soft drop shadow behind the congregation lyrics (over-photo legibility). */
  lyricShadow?: boolean;
  /** Strip Verovio's inter-syllable connector hyphens (the 인-자-야 dashes). */
  hideLyricHyphens?: boolean;
  /** Ink colour for staff/notes/text (hex, no '#'); default engine black. */
  inkColor?: string;
  /** Line-weight scale (1 = engine default) for staff/stem/barline widths. */
  lineThickness?: number;
  /** Pin the text (lyric/chord) font family for deterministic rasterization. */
  textFontFamily?: string;
  /**
   * Embeddable font file paths. When provided, system fonts are NOT loaded, so
   * rasterization is deterministic across machines (PRD §8.4).
   */
  fontFiles?: string[];
  /** Escape hatch for renderer-specific options (kept out of the domain). */
  rendererOptions?: Record<string, unknown>;
}

export interface RenderScoreInput {
  musicXml: string;
  outputMode: RenderOutputMode;
  options?: RenderOptions;
}

export interface RenderedPage {
  index: number;
  /** Present when outputMode === "svg". */
  svg?: string;
  /** Present when outputMode === "png". */
  png?: Uint8Array;
  widthPx: number;
  heightPx: number;
}

export interface RenderScoreResult {
  providerName: string;
  providerVersion: string;
  runId: string;
  outputMode: RenderOutputMode;
  pages: RenderedPage[];
}

export interface RenderSystemInput extends RenderScoreInput {
  systemIndex: number;
}

export interface RenderSystemResult extends RenderScoreResult {}

export interface RendererProvider {
  readonly providerName: string;
  readonly providerVersion: string;
  /**
   * How many renders may run in parallel safely. A single WASM toolkit is
   * stateful → 1 (default); a worker pool can run its size concurrently.
   */
  readonly maxConcurrency?: number;
  renderScore(input: RenderScoreInput): Promise<RenderScoreResult>;
  renderSystem(input: RenderSystemInput): Promise<RenderSystemResult>;
  healthCheck(): Promise<ProviderHealth>;
  /** Release native/WASM resources. Callers that own the renderer should call it. */
  dispose?(): Promise<void> | void;
}

// ---------------------------------------------------------------------------
// PptxBuilder (PRD §PPT-001..004, §15)
// ---------------------------------------------------------------------------

export interface PptxImage {
  data: Uint8Array;
  mime: "image/png";
  widthPx: number;
  heightPx: number;
}

export interface PptxSlideSpec {
  index: number;
  title?: string;
  sectionLabel?: string;
  image: PptxImage;
  /** Congregation lyric text, one entry per sung line (projection subtitle). */
  lyricLines?: string[];
}

export interface PptxBackgroundImage {
  data: Uint8Array;
  mime: "image/png" | "image/jpeg";
}

export interface PptxProfile {
  slideWidthInches: number;
  slideHeightInches: number;
  safeMarginInches: number;
  /** Solid slide background colour (hex, no '#'); ignored if backgroundImage set. */
  background?: string;
  /** Common background image placed behind the score on every slide. */
  backgroundImage?: PptxBackgroundImage;
  /** Legibility card behind the score (one consistent "card" concept). */
  card?: CardStyle;
  title?: TextStyle;
  sectionLabel?: TextStyle;
  /** Drop shadow behind title/section text. Default false. */
  textShadow?: boolean;
  /** Compact projection chrome: small ♪ title top-left, section label top-right. */
  compact?: boolean;
  /** Font for the big congregation lyric text in the subtitle (compact) layout. */
  lyricFontFace?: string;
}

/**
 * Optional TrueType/OpenType font embedding for the PPTX's native text (title,
 * section labels). Score lyrics are rasterized into the slide image, so they are
 * always self-contained; this only makes the editable text portable to machines
 * that lack the font. Embeds the full font (no subsetting), so it is opt-in.
 */
export interface PptxFontEmbed {
  /** Font family as referenced by the text runs (e.g. "Pretendard"). */
  family: string;
  /** Raw font bytes for the regular weight. */
  regular: Uint8Array;
  /** Raw font bytes for the bold weight, if available. */
  bold?: Uint8Array;
}

export interface GeneratePptxInput {
  metadata: { title?: string; subtitle?: string; copyright?: string };
  profile: PptxProfile;
  slides: PptxSlideSpec[];
  idempotencyKey?: string;
  /** When set, embed these fonts into the package (opt-in; full font, large). */
  fontEmbed?: PptxFontEmbed;
}

export interface GeneratedPptx {
  buffer: Uint8Array;
  slideCount: number;
  builderName: string;
  builderVersion: string;
}

export interface PptxCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface PptxValidationResult {
  ok: boolean;
  checks: PptxCheck[];
}

export interface ValidatePptxInput {
  buffer: Uint8Array;
  expectedSlideCount?: number;
}

export interface PptxBuilder {
  readonly builderName: string;
  readonly builderVersion: string;
  generate(input: GeneratePptxInput): Promise<GeneratedPptx>;
  validate(input: ValidatePptxInput): Promise<PptxValidationResult>;
}

// ---------------------------------------------------------------------------
// Forward-compat interfaces (declared now; implemented in later milestones)
// ---------------------------------------------------------------------------

export interface OMRCapabilities {
  supportsHandwriting: boolean;
  supportsPolyphony: boolean;
  maxStaves: number;
}

export interface OMRProvider {
  readonly providerName: string;
  readonly providerVersion: string;
  inspectCapabilities(): Promise<OMRCapabilities>;
  // recognize(...) and recognizeRegion(...) are defined in Milestone 3.
  healthCheck(): Promise<ProviderHealth>;
}

export interface VisionReviewProvider {
  readonly providerName: string;
  readonly modelName: string;
  // review(...) is defined in Milestone 5.
}

export interface ObjectStorageProvider {
  readonly providerName: string;
  // put/get/signedUrl(...) are defined in Milestone 2.
}

export interface JobQueueProvider {
  readonly providerName: string;
  // enqueue/process(...) are defined in Milestone 2.
}
