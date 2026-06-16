/**
 * @worship-score/adapters — infrastructure adapters implementing core provider
 * interfaces. These depend on external engines (Verovio, PptxGenJS, resvg);
 * the domain layer never imports them directly.
 */
export { VerovioRenderer } from "./verovio/renderer.js";
export { VerovioRendererPool, defaultPoolSize } from "./verovio/pool.js";
export { PptxGenJsBuilder } from "./pptx/builder.js";
export { validatePptxOoxml } from "./pptx/ooxml.js";
export { rasterizeSvg, type RasterizeOptions } from "./raster.js";
