/**
 * @worship-score/core — domain layer barrel.
 * No external engine or infrastructure imports live in this package.
 */

// Types
export * from "./types/scoreir.js";
export * from "./types/validation.js";
export * from "./types/presentation.js";
export * from "./types/providers.js";
export * from "./types/build.js";

// Musical context + durations
export {
  computeActiveAttributes,
  orderedMeasures,
  type ActiveAttributes,
} from "./context.js";
export {
  DEFAULT_DIVISIONS,
  eventDurationDivisions,
  measureDurationDivisions,
} from "./duration.js";

// Validation
export { validateScore } from "./validation/index.js";

// MusicXML
export {
  serializeMusicXml,
  prepareScore,
  type SerializeOptions,
  type PreparedScore,
} from "./musicxml/serialize.js";
export { validateMusicXmlAgainstXsd, type XsdValidationResult } from "./musicxml/xsd.js";

// Transposition & chords
export { transposeScore, transposeKey } from "./transpose.js";
export { deriveChordText, deriveChordSuffix } from "./chord.js";

// Presentation
export {
  DEFAULT_PRESENTATION_PROFILE,
  PROJECTION_PRESENTATION_PROFILE,
  PRESENTATION_PROFILE_VERSION,
} from "./presentation/profile.js";
export { planPresentation, SLIDE_PLAN_VERSION } from "./presentation/slidePlan.js";

// Schema
export { scoreIrSchema, parseScoreIr, safeParseScoreIr } from "./schema/scoreir.schema.js";
