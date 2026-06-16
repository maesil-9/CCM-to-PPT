/** @worship-score/pipeline — score→PPTX build engine + fixtures. */
export {
  buildPresentation,
  type BuildPresentationInput,
  type BuildPresentationResult,
  type FontConfig,
  type SlideAsset,
} from "./buildPresentation.js";
export { defaultFontConfig, fontEmbedFromConfig, bundledFontFiles, BUNDLED_FONT_FAMILY } from "./fonts.js";
export { buildCleanDigitalSample } from "./fixtures/cleanDigitalSample.js";
export { buildDemoScore } from "./fixtures/demoScore.js";
