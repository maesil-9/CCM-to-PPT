/**
 * Provider interfaces (PRD §12.3, §9 of the implementation prompt).
 *
 * The domain depends only on these interfaces — never on Verovio, PptxGenJS,
 * an OMR engine, or any SDK directly. Concrete adapters live in
 * `@worship-score/adapters`. Each provider result records the provider name,
 * version, and a run id for traceability.
 */
import type { TextStyle } from "./build.js";

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
  /** Rasterization scale for PNG output (1 = native Verovio px). */
  scale?: number;
  /** Page width/height in Verovio units (1/100 mm). */
  pageWidth?: number;
  pageHeight?: number;
  /** Let the renderer shrink page height to content. */
  adjustPageHeight?: boolean;
  /** Minimum staff size hint. */
  minStaffSize?: number;
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
  renderScore(input: RenderScoreInput): Promise<RenderScoreResult>;
  renderSystem(input: RenderSystemInput): Promise<RenderSystemResult>;
  healthCheck(): Promise<ProviderHealth>;
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
  /** Opacity (0..1) of the legibility card behind the score. 0/undefined = none. */
  scoreScrim?: number;
  /** Legibility card colour (hex, no '#'). Default "FFFFFF". */
  cardColor?: string;
  title?: TextStyle;
  sectionLabel?: TextStyle;
  /** @deprecated use title.color */
  titleColor?: string;
  /** @deprecated use sectionLabel.color */
  labelColor?: string;
}

export interface GeneratePptxInput {
  metadata: { title?: string; subtitle?: string; copyright?: string };
  profile: PptxProfile;
  slides: PptxSlideSpec[];
  idempotencyKey?: string;
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
