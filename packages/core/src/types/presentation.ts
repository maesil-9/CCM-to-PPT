/** Presentation profile and slide plan model (PRD §RND-003/004, §14, §STR-002). */

export interface PresentationProfile {
  version: string;
  ratio: "16:9";
  chordVisibility: "hidden" | "visible";
  /** Max staff systems rendered on a single slide. */
  maxSystemsPerSlide: number;
  /** Measures packed into one system before wrapping. */
  measuresPerSystem: number;
  /** Minimum staff size (Verovio units / px) for back-of-room readability. */
  minimumStaffSize: number;
  safeMarginInches: number;
  titleVisibility: "first-slide" | "every-slide" | "hidden";
  sectionLabelVisibility: boolean;
  /** Primary render asset preference. The PPTX builder always embeds PNG. */
  outputMode: "svg" | "png";
  slideWidthInches: number;
  slideHeightInches: number;
}

export interface SlidePlanSlide {
  index: number;
  title?: string;
  sectionLabel?: string;
  /** Measures to render on this slide, in order. Never splits a measure. */
  measureIds: string[];
  /** Lyric verse to display for this slide. */
  verse?: number;
}

export interface SlidePlan {
  planVersion: string;
  profileVersion: string;
  profile: PresentationProfile;
  slides: SlidePlanSlide[];
}
