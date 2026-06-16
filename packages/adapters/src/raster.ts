/** Standalone SVG→PNG rasterization (shares the Verovio renderer's resvg path). */
import { Resvg, type ResvgRenderOptions } from "@resvg/resvg-js";

export interface RasterizeOptions {
  /** Zoom factor; >1 upscales. Default 1 (intrinsic SVG size). */
  zoom?: number;
  /** Background CSS colour; default transparent. */
  background?: string;
  /** Embeddable font files; when set, system fonts are disabled (deterministic). */
  fontFiles?: string[];
  /** Default font family for unresolved text. */
  defaultFontFamily?: string;
}

function fontConfig(options: RasterizeOptions): ResvgRenderOptions["font"] {
  if (options.fontFiles && options.fontFiles.length > 0) {
    return {
      loadSystemFonts: false,
      fontFiles: options.fontFiles,
      ...(options.defaultFontFamily ? { defaultFontFamily: options.defaultFontFamily } : {}),
    };
  }
  return {
    loadSystemFonts: true,
    ...(options.defaultFontFamily ? { defaultFontFamily: options.defaultFontFamily } : {}),
  };
}

export function rasterizeSvg(
  svg: string,
  options: RasterizeOptions = {},
): { data: Uint8Array; width: number; height: number } {
  const resvg = new Resvg(svg, {
    fitTo: options.zoom ? { mode: "zoom", value: options.zoom } : { mode: "original" },
    ...(options.background ? { background: options.background } : {}),
    font: fontConfig(options),
  });
  const rendered = resvg.render();
  return { data: new Uint8Array(rendered.asPng()), width: rendered.width, height: rendered.height };
}
