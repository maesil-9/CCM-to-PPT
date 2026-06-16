/**
 * Server-side build engine: a Verovio renderer + PptxGenJS builder are reused
 * across requests for fast previews.
 *
 * Concurrency: a single Verovio toolkit is stateful, so by default engine calls
 * are serialized through a mutex. Set `WS_RENDER_WORKERS=N` (N>0) to use a pool
 * of N worker-thread renderers instead — each owns its own toolkit, so renders
 * run truly in parallel and the mutex is dropped (a fresh PptxGenJS builder is
 * used per call so concurrent exports stay independent).
 */
import { cpus } from "node:os";
import { buildPresentation } from "@worship-score/pipeline";
import { PptxGenJsBuilder, VerovioRenderer, VerovioRendererPool } from "@worship-score/adapters";
import type {
  BuildOptions,
  PresentationProfile,
  RendererProvider,
  ScoreIR,
  ScoreValidationResult,
} from "@worship-score/core";

/**
 * Render concurrency. Default: a small worker pool so a multi-slide preview
 * renders its slides in parallel (the main source of preview lag). Set
 * WS_RENDER_WORKERS=N to override, or =0 to force the single-toolkit + mutex.
 */
const RENDER_WORKERS = (() => {
  const raw = process.env.WS_RENDER_WORKERS;
  if (raw === undefined || raw.trim() === "") {
    return Math.max(1, Math.min(4, (cpus().length || 2) - 1));
  }
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 8) : 0;
})();

let rendererPromise: Promise<RendererProvider> | undefined;
let builder: PptxGenJsBuilder | undefined;

function getRenderer(): Promise<RendererProvider> {
  rendererPromise ??= RENDER_WORKERS > 0
    ? VerovioRendererPool.create(RENDER_WORKERS)
    : VerovioRenderer.create();
  return rendererPromise;
}

/** Readiness probe: healthy renderer? Drops a broken instance so it is recreated. */
export async function getReadiness(): Promise<boolean> {
  try {
    const r = await getRenderer();
    const h = await r.healthCheck();
    if (!h.ok) rendererPromise = undefined;
    return h.ok;
  } catch {
    rendererPromise = undefined;
    return false;
  }
}

/** Awaits any in-flight engine task — used for graceful shutdown. */
export function drain(): Promise<unknown> {
  return Promise.allSettled([tail, ...inFlight]);
}

function getBuilder(): PptxGenJsBuilder {
  // Pool mode runs builds concurrently, so hand out a fresh builder per call to
  // keep concurrent exports independent. Single mode reuses one (serialized).
  if (RENDER_WORKERS > 0) return new PptxGenJsBuilder();
  builder ??= new PptxGenJsBuilder();
  return builder;
}

// Simple FIFO mutex: chain each task after the previous one.
let tail: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// In-flight tracker for pool mode (renders run concurrently, no mutex).
const inFlight = new Set<Promise<unknown>>();

/** Serialize via the mutex (single toolkit) or run concurrently (worker pool). */
function runEngine<T>(fn: () => Promise<T>): Promise<T> {
  if (RENDER_WORKERS === 0) return withLock(fn);
  const run = fn();
  const tracked = run.then(() => undefined, () => undefined);
  inFlight.add(tracked);
  void tracked.finally(() => inFlight.delete(tracked));
  return run;
}

export interface PreviewSlide {
  index: number;
  title?: string;
  sectionLabel?: string;
  verse?: number;
  widthPx: number;
  heightPx: number;
  png: string; // base64 of the score image (style is composed client-side)
}

export interface PreviewResult {
  slides: PreviewSlide[];
  validation: ScoreValidationResult;
  ooxmlOk: boolean;
}

export function renderPreview(
  score: ScoreIR,
  options: Partial<BuildOptions>,
  profile?: PresentationProfile,
): Promise<PreviewResult> {
  return runEngine(async () => {
    const renderer = await getRenderer();
    const result = await buildPresentation({
      score,
      options,
      ...(profile ? { profile } : {}),
      renderer,
      builder: getBuilder(),
      emitFullMusicXml: false,
    });
    const assetByIndex = new Map(result.assets.map((a) => [a.index, a]));
    return {
      slides: result.slidePlan.slides.map((s) => {
        const asset = assetByIndex.get(s.index);
        return {
          index: s.index,
          ...(s.title ? { title: s.title } : {}),
          ...(s.sectionLabel ? { sectionLabel: s.sectionLabel } : {}),
          ...(s.verse !== undefined ? { verse: s.verse } : {}),
          widthPx: asset?.widthPx ?? 0,
          heightPx: asset?.heightPx ?? 0,
          png: asset ? Buffer.from(asset.png).toString("base64") : "",
        };
      }),
      validation: result.scoreValidation,
      ooxmlOk: result.validation.ok,
    };
  });
}

export class ExportValidationError extends Error {}

export function exportPptx(
  score: ScoreIR,
  options: Partial<BuildOptions>,
  profile?: PresentationProfile,
): Promise<Uint8Array> {
  return runEngine(async () => {
    const renderer = await getRenderer();
    const result = await buildPresentation({
      score,
      options,
      ...(profile ? { profile } : {}),
      renderer,
      builder: getBuilder(),
      emitFullMusicXml: false,
    });
    if (!result.validation.ok) {
      const failed = result.validation.checks.filter((c) => !c.passed).map((c) => c.name).join(", ");
      throw new ExportValidationError(`파일 구조 검증 실패 — 내보낼 수 없습니다 (${failed})`);
    }
    return result.pptx.buffer;
  });
}
