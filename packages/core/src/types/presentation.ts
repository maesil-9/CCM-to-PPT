/** Presentation profile and slide plan model (PRD §RND-003/004, §14, §STR-002). */

export interface PresentationProfile {
  version: string;
  ratio: "16:9";
  /**
   * "leadsheet" — printed-score engraving: dense multi-system staff, chords,
   * small lyrics (back-of-room reference sheet).
   * "projection" — worship subtitle slide: big congregation lyrics, a small
   * melody guide, chunked by sung phrase (default for live projection).
   */
  layout?: "leadsheet" | "projection";
  /** Lyric font size (Verovio points, 2–8). Projection uses the large end. */
  lyricSize?: number;
  chordVisibility: "hidden" | "visible";
  /** Max staff systems rendered on a single slide (projection: lyric lines/slide). */
  maxSystemsPerSlide: number;
  /** Measures packed into one system before wrapping (leadsheet only). */
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
  /**
   * Measure ids that begin a new staff system within this slide (projection
   * layout: the first measure of each lyric line after the first).
   */
  systemBreakMeasureIds?: string[];
  /** Lyric verse to display for this slide. */
  verse?: number;
}

export interface SlidePlan {
  planVersion: string;
  profileVersion: string;
  profile: PresentationProfile;
  slides: SlidePlanSlide[];
}
