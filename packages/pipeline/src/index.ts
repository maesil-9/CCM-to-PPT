/** @worship-score/pipeline — score→PPTX build engine + fixtures. */
export {
  buildPresentation,
  type BuildPresentationInput,
  type BuildPresentationResult,
  type SlideAsset,
} from "./buildPresentation.js";
export { buildCleanDigitalSample } from "./fixtures/cleanDigitalSample.js";
export { buildDemoScore } from "./fixtures/demoScore.js";
