/**
 * PptxGenJsBuilder — PptxBuilder backed by PptxGenJS (PRD §PPT-001).
 *
 * Embeds rendered score images as PNG (the mandated compatibility mode), placed
 * with contain-fit inside a safe-margin content box so nothing is ever clipped
 * (acceptance: "슬라이드 요소 잘림 0"). The builder is kept replaceable behind
 * the PptxBuilder interface.
 */
import pptxgen from "pptxgenjs";
import type {
  GeneratedPptx,
  GeneratePptxInput,
  PptxBuilder,
  PptxValidationResult,
  ValidatePptxInput,
} from "@worship-score/core";
import { validatePptxOoxml } from "./ooxml.js";

const BUILDER_NAME = "pptxgenjs";
const BUILDER_VERSION = "4.0.1";

// pptxgenjs is a CJS package whose merged class+namespace default export is not
// seen as constructable under NodeNext. At runtime the default import IS the
// constructor; we describe the surface we use with a structural type and cast,
// keeping the engine's types out of the rest of the codebase.
interface PptxTextOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
}
interface PptxImageOptions {
  data: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface PptxSlide {
  background: { color: string };
  addText(text: string, opts: PptxTextOptions): void;
  addImage(opts: PptxImageOptions): void;
}
interface PptxPresentation {
  defineLayout(opts: { name: string; width: number; height: number }): void;
  layout: string;
  title: string;
  author: string;
  company: string;
  addSlide(): PptxSlide;
  write(opts: { outputType: string }): Promise<Buffer | Uint8Array | ArrayBuffer | string>;
}
// Under ESM/CJS interop (tsx, Node) the default import is the interop namespace
// whose `.default` is the real constructor; fall back to the import itself for
// environments that expose the class directly.
const PptxGenJSCtor =
  (pptxgen as unknown as { default?: unknown }).default ?? pptxgen;
const PptxGenJS = PptxGenJSCtor as unknown as new () => PptxPresentation;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Centered contain-fit preserving aspect ratio (inches). */
function fitContain(imgWidthPx: number, imgHeightPx: number, box: Box): Box {
  if (imgWidthPx <= 0 || imgHeightPx <= 0) return box;
  const scale = Math.min(box.w / imgWidthPx, box.h / imgHeightPx);
  const w = imgWidthPx * scale;
  const h = imgHeightPx * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

export class PptxGenJsBuilder implements PptxBuilder {
  readonly builderName = BUILDER_NAME;
  readonly builderVersion = BUILDER_VERSION;

  async generate(input: GeneratePptxInput): Promise<GeneratedPptx> {
    const { profile } = input;
    const pptx = new PptxGenJS();
    pptx.defineLayout({
      name: "WS_16x9",
      width: profile.slideWidthInches,
      height: profile.slideHeightInches,
    });
    pptx.layout = "WS_16x9";
    if (input.metadata.title) pptx.title = input.metadata.title;
    pptx.author = "WorshipScore AI";
    pptx.company = "WorshipScore AI";

    const margin = profile.safeMarginInches;
    const slideW = profile.slideWidthInches;
    const slideH = profile.slideHeightInches;

    for (const spec of input.slides) {
      const slide = pptx.addSlide();
      slide.background = { color: profile.background ?? "FFFFFF" };

      let contentTop = margin;

      if (spec.title) {
        slide.addText(spec.title, {
          x: margin,
          y: margin * 0.5,
          w: slideW - 2 * margin,
          h: 0.7,
          fontSize: 26,
          bold: true,
          align: "center",
          color: profile.titleColor ?? "111111",
        });
        contentTop = margin * 0.5 + 0.8;
      }

      if (spec.sectionLabel) {
        slide.addText(spec.sectionLabel, {
          x: margin,
          y: contentTop,
          w: slideW - 2 * margin,
          h: 0.4,
          fontSize: 16,
          bold: true,
          align: "left",
          color: profile.labelColor ?? "555555",
        });
        contentTop += 0.55;
      }

      const box: Box = {
        x: margin,
        y: contentTop,
        w: slideW - 2 * margin,
        h: slideH - contentTop - margin,
      };
      const fit = fitContain(spec.image.widthPx, spec.image.heightPx, box);
      slide.addImage({
        data: `data:${spec.image.mime};base64,${toBase64(spec.image.data)}`,
        x: fit.x,
        y: fit.y,
        w: fit.w,
        h: fit.h,
      });
    }

    const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer | Uint8Array;
    const buffer = out instanceof Uint8Array ? new Uint8Array(out) : new Uint8Array(Buffer.from(out));

    return {
      buffer,
      slideCount: input.slides.length,
      builderName: this.builderName,
      builderVersion: this.builderVersion,
    };
  }

  async validate(input: ValidatePptxInput): Promise<PptxValidationResult> {
    return validatePptxOoxml(input.buffer, input.expectedSlideCount);
  }
}
