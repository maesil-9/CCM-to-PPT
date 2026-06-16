/** Standalone SVG→PNG rasterization (shares the Verovio renderer's resvg path). */
import { Resvg } from "@resvg/resvg-js";

export interface RasterizeOptions {
  /** Zoom factor; >1 upscales. Default 1 (intrinsic SVG size). */
  zoom?: number;
  /** Background CSS colour; default transparent. */
  background?: string;
}

export function rasterizeSvg(
  svg: string,
  options: RasterizeOptions = {},
): { data: Uint8Array; width: number; height: number } {
  const resvg = new Resvg(svg, {
    fitTo: options.zoom ? { mode: "zoom", value: options.zoom } : { mode: "original" },
    ...(options.background ? { background: options.background } : {}),
    font: { loadSystemFonts: true },
  });
  const rendered = resvg.render();
  return { data: new Uint8Array(rendered.asPng()), width: rendered.width, height: rendered.height };
}
