/**
 * Server-side build engine: a singleton Verovio renderer + PptxGenJS builder are
 * reused across requests for fast previews. Verovio's toolkit is stateful, so all
 * engine calls are serialized through a mutex.
 */
import { buildPresentation } from "@worship-score/pipeline";
import { PptxGenJsBuilder, VerovioRenderer } from "@worship-score/adapters";
import type { BuildOptions, RendererProvider, ScoreIR, ScoreValidationResult } from "@worship-score/core";

let rendererPromise: Promise<RendererProvider> | undefined;
let builder: PptxGenJsBuilder | undefined;

function getRenderer(): Promise<RendererProvider> {
  rendererPromise ??= VerovioRenderer.create();
  return rendererPromise;
}

function getBuilder(): PptxGenJsBuilder {
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

export function renderPreview(score: ScoreIR, options: Partial<BuildOptions>): Promise<PreviewResult> {
  return withLock(async () => {
    const renderer = await getRenderer();
    const result = await buildPresentation({
      score,
      options,
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

export function exportPptx(score: ScoreIR, options: Partial<BuildOptions>): Promise<Uint8Array> {
  return withLock(async () => {
    const renderer = await getRenderer();
    const result = await buildPresentation({
      score,
      options,
      renderer,
      builder: getBuilder(),
      emitFullMusicXml: false,
    });
    return result.pptx.buffer;
  });
}
