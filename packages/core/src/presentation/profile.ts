import type { PresentationProfile } from "../types/presentation.js";

export const PRESENTATION_PROFILE_VERSION = "profile-0.1.0";

/** Default 16:9 worship profile (PRD §14 DEFAULT_PRESENTATION_PROFILE). */
export const DEFAULT_PRESENTATION_PROFILE: PresentationProfile = {
  version: PRESENTATION_PROFILE_VERSION,
  ratio: "16:9",
  chordVisibility: "hidden",
  // 2 measures per line × up to 4 lines fills a 16:9 slide with a large,
  // back-of-room-readable staff (PRD §RND-003).
  maxSystemsPerSlide: 4,
  measuresPerSystem: 2,
  minimumStaffSize: 32,
  safeMarginInches: 0.35,
  titleVisibility: "first-slide",
  sectionLabelVisibility: true,
  outputMode: "svg",
  // 16:9 PowerPoint widescreen geometry.
  slideWidthInches: 13.333,
  slideHeightInches: 7.5,
};

/**
 * Worship projection profile: big congregation lyrics over a small melody
 * guide, chunked by sung phrase (`systemBreak`), two lines per slide, no chords,
 * title on every slide. The format congregations read off the screen.
 */
export const PROJECTION_PRESENTATION_PROFILE: PresentationProfile = {
  version: PRESENTATION_PROFILE_VERSION,
  ratio: "16:9",
  layout: "projection",
  lyricSize: 8,
  chordVisibility: "hidden",
  // In projection, maxSystemsPerSlide = sung lines per slide (reference: 2).
  maxSystemsPerSlide: 2,
  measuresPerSystem: 2,
  // Verovio `scale` percent. Must exceed the renderer's BASE_SCALE (50) or it is
  // a no-op floor (the old value 28 silently rendered at the 50 default). 60
  // gives a crisper, slightly larger engraving; cross-slide size is normalised
  // at composite time, so this mainly sets render resolution + proportions.
  minimumStaffSize: 60,
  safeMarginInches: 0.4,
  titleVisibility: "every-slide",
  sectionLabelVisibility: true,
  outputMode: "svg",
  slideWidthInches: 13.333,
  slideHeightInches: 7.5,
};
