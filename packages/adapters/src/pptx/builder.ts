/**
 * PptxGenJsBuilder — PptxBuilder backed by PptxGenJS (PRD §PPT-001).
 *
 * Embeds rendered score images as PNG (the mandated compatibility mode), placed
 * with contain-fit inside a safe-margin content box so nothing is ever clipped
 * (acceptance: "슬라이드 요소 잘림 0").
 *
 * Supports a common background image per score with a translucent legibility
 * card behind the staff, and output typography (font/colour) — the surface a
 * future web styling editor drives. The builder stays replaceable behind the
 * PptxBuilder interface.
 */
import pptxgen from "pptxgenjs";
import type {
  GeneratedPptx,
  GeneratePptxInput,
  PptxBuilder,
  PptxValidationResult,
  TextStyle,
  ValidatePptxInput,
} from "@worship-score/core";
import { validatePptxOoxml } from "./ooxml.js";

const BUILDER_NAME = "pptxgenjs";
const BUILDER_VERSION = "4.0.1";

// pptxgenjs is a CJS package whose merged class+namespace default export is not
// seen as constructable under NodeNext. At runtime the default import IS the
// constructor; we describe the surface we use with a structural type and cast,
// keeping the engine's types out of the rest of the codebase.
interface PptxShadow {
  type: "outer" | "inner";
  color: string;
  blur: number;
  offset: number;
  angle: number;
  opacity: number;
}
interface PptxTextOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  fontFace?: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  shadow?: PptxShadow;
}
interface PptxImageOptions {
  data: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sizing?: { type: "cover" | "contain" | "crop"; w: number; h: number };
}
interface PptxShapeOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: { color: string; transparency?: number };
  line?: { color: string; width: number };
  rectRadius?: number;
}
interface PptxSlide {
  background: { color: string };
  addText(text: string, opts: PptxTextOptions): void;
  addImage(opts: PptxImageOptions): void;
  addShape(shapeType: string, opts: PptxShapeOptions): void;
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
const PptxGenJSCtor = (pptxgen as unknown as { default?: unknown }).default ?? pptxgen;
const PptxGenJS = PptxGenJSCtor as unknown as new () => PptxPresentation;

const ROUND_RECT = "roundRect";

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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class PptxGenJsBuilder implements PptxBuilder {
  readonly builderName = BUILDER_NAME;
  readonly builderVersion = BUILDER_VERSION;

  async generate(input: GeneratePptxInput): Promise<GeneratedPptx> {
    const { profile } = input;
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "WS_16x9", width: profile.slideWidthInches, height: profile.slideHeightInches });
    pptx.layout = "WS_16x9";
    if (input.metadata.title) pptx.title = input.metadata.title;
    pptx.author = "WorshipScore AI";
    pptx.company = "WorshipScore AI";

    const margin = profile.safeMarginInches;
    const slideW = profile.slideWidthInches;
    const slideH = profile.slideHeightInches;
    const hasBgImage = !!profile.backgroundImage;
    const cardOpacity = clamp(profile.card?.opacity ?? 0, 0, 1);
    const cardColor = profile.card?.color ?? "FFFFFF";
    // Encode the common background once, not per slide.
    const bgDataUri = profile.backgroundImage
      ? `data:${profile.backgroundImage.mime};base64,${toBase64(profile.backgroundImage.data)}`
      : undefined;

    const titleStyle: TextStyle = profile.title ?? {};
    const labelStyle: TextStyle = profile.sectionLabel ?? {};
    const titleColor = titleStyle.color ?? (hasBgImage ? "FFFFFF" : "111111");
    const labelColor = labelStyle.color ?? (hasBgImage ? "F2F2F2" : "555555");
    const textShadow: PptxShadow | undefined = hasBgImage
      ? { type: "outer", color: "000000", blur: 4, offset: 2, angle: 90, opacity: 0.6 }
      : undefined;

    for (const spec of input.slides) {
      const slide = pptx.addSlide();
      slide.background = { color: profile.background ?? "FFFFFF" };

      // 1. Common background image (full-bleed cover), behind everything.
      if (bgDataUri) {
        slide.addImage({
          data: bgDataUri,
          x: 0,
          y: 0,
          w: slideW,
          h: slideH,
          sizing: { type: "cover", w: slideW, h: slideH },
        });
      }

      let contentTop = margin;

      if (spec.title) {
        slide.addText(spec.title, {
          x: margin,
          y: margin * 0.5,
          w: slideW - 2 * margin,
          h: 0.7,
          fontSize: titleStyle.fontSize ?? 26,
          bold: titleStyle.bold ?? true,
          ...(titleStyle.italic !== undefined ? { italic: titleStyle.italic } : {}),
          ...(titleStyle.fontFace ? { fontFace: titleStyle.fontFace } : {}),
          align: "center",
          color: titleColor,
          ...(textShadow ? { shadow: textShadow } : {}),
        });
        contentTop = margin * 0.5 + 0.8;
      }

      if (spec.sectionLabel) {
        slide.addText(spec.sectionLabel, {
          x: margin,
          y: contentTop,
          w: slideW - 2 * margin,
          h: 0.4,
          fontSize: labelStyle.fontSize ?? 16,
          bold: labelStyle.bold ?? true,
          ...(labelStyle.italic !== undefined ? { italic: labelStyle.italic } : {}),
          ...(labelStyle.fontFace ? { fontFace: labelStyle.fontFace } : {}),
          align: "left",
          color: labelColor,
          ...(textShadow ? { shadow: textShadow } : {}),
        });
        contentTop += 0.55;
      }

      const box: Box = { x: margin, y: contentTop, w: slideW - 2 * margin, h: slideH - contentTop - margin };
      if (box.w <= 0 || box.h <= 0) {
        throw new Error(
          `슬라이드 콘텐츠 영역이 음수입니다(제목/섹션 라벨이 너무 큼): w=${box.w.toFixed(2)} h=${box.h.toFixed(2)}. 폰트 크기/여백을 줄이세요.`,
        );
      }
      const fit = fitContain(spec.image.widthPx, spec.image.heightPx, box);

      // 2. Legibility card behind the score, clamped inside the content box.
      if (cardOpacity > 0) {
        const pad = 0.18;
        const cardX = Math.max(box.x, fit.x - pad);
        const cardY = Math.max(box.y, fit.y - pad);
        const cardRight = Math.min(box.x + box.w, fit.x + fit.w + pad);
        const cardBottom = Math.min(box.y + box.h, fit.y + fit.h + pad);
        slide.addShape(ROUND_RECT, {
          x: cardX,
          y: cardY,
          w: cardRight - cardX,
          h: cardBottom - cardY,
          fill: { color: cardColor, transparency: Math.round((1 - cardOpacity) * 100) },
          rectRadius: 0.08,
        });
      }

      // 3. The score image on top.
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
