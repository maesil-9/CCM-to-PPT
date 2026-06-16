import type { PresentationProfile } from "../types/presentation.js";

export const PRESENTATION_PROFILE_VERSION = "profile-0.1.0";

/** Default 16:9 worship profile (PRD §14 DEFAULT_PRESENTATION_PROFILE). */
export const DEFAULT_PRESENTATION_PROFILE: PresentationProfile = {
  version: PRESENTATION_PROFILE_VERSION,
  ratio: "16:9",
  chordVisibility: "hidden",
  maxSystemsPerSlide: 2,
  measuresPerSystem: 4,
  minimumStaffSize: 32,
  safeMarginInches: 0.35,
  titleVisibility: "first-slide",
  sectionLabelVisibility: true,
  outputMode: "svg",
  // 16:9 PowerPoint widescreen geometry.
  slideWidthInches: 13.333,
  slideHeightInches: 7.5,
};
