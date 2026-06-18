/**
 * Per-score build options (PRD: 박자·음표·가사는 고정, 코드·키는 선택 옵션).
 *
 * These are presentation/output choices, kept separate from ScoreIR (the score
 * data). Chord symbols live in ScoreIR as a hidden layer; `chords.visible`
 * decides whether they are rendered. `key.transposeSemitones` re-keys the
 * output. `background` overlays a common image behind the staff.
 */

export interface ChordOptions {
  /** Show chord symbols above the staff. Default false (hidden). */
  visible: boolean;
}

export interface KeyOptions {
  /** Chromatic transpose applied to the whole score. 0 = original key. */
  transposeSemitones: number;
}

export interface TempoOptions {
  /** Show the tempo mark (metronome ♩ = N) on the first system. Default true. */
  visible: boolean;
}

export interface VisibilityOption {
  visible: boolean;
}

export interface BackgroundImageOptions {
  data: Uint8Array;
  mime: "image/png" | "image/jpeg";
}

/**
 * Legibility card drawn behind the score so the staff stays readable over a
 * background. One consistent "card" concept (colour + opacity) across all layers.
 */
export interface CardStyle {
  /** Card colour (hex, no '#'). Default white. */
  color?: string;
  /** Opacity 0..1 (0 = no card). */
  opacity?: number;
}

/**
 * Output typography/colour styling. This is exactly the surface a future web
 * editor exposes (font / colour / typography with live preview) — score content
 * itself is NOT edited here.
 */
export interface TextStyle {
  /** Font family name (must be installed/embeddable for rasterization). */
  fontFace?: string;
  fontSize?: number;
  /** Hex colour without leading '#', e.g. "111111". */
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface StyleOptions {
  title?: TextStyle;
  sectionLabel?: TextStyle;
  /** Slide background colour (hex, no '#') when no background image is set. */
  backgroundColor?: string;
  /** Legibility card behind the score. */
  card?: CardStyle;
  /** Drop shadow behind the title/section text. Default false. */
  textShadow?: boolean;
}

/**
 * Score (staff/notes) appearance — the engraved ink itself, not the slide chrome.
 * Affects the Verovio render (so changing it re-renders the score).
 */
export interface ScoreAppearance {
  /** Ink colour for staff, notes, stems, lyrics (hex, no '#'). Default black. */
  inkColor?: string;
  /** Line-weight scale (1 = Verovio default); affects staff/stem/barline width. */
  lineThickness?: number;
  /**
   * Font family for the lyrics in the engraved score. Default is the bundled
   * Pretendard; choosing another loads system fonts so it can render.
   */
  lyricFont?: string;
  /** Bold the congregation lyrics. */
  lyricBold?: boolean;
  /** Lyric fill colour (overrides ink for lyrics only), hex without '#'. */
  lyricColor?: string;
  /** Lyric outline (외곽선) colour, hex without '#'. */
  lyricOutlineColor?: string;
  /** Lyric outline width as a percentage of glyph height (0 = none). */
  lyricOutlineWidth?: number;
  /** Drop a soft shadow behind the congregation lyrics (legibility over photos). */
  lyricShadow?: boolean;
  /**
   * Show the inter-syllable connector hyphens (the short dashes between the
   * syllables of a word, e.g. 인-자-야). Korean worship lyrics read cleaner
   * without them, so projection slides hide them unless this is set true.
   */
  lyricHyphens?: boolean;
  /** Gap between staff and lyrics (Verovio units; larger = more space). */
  lyricGap?: number;
}

export interface BuildOptions {
  chords: ChordOptions;
  key: KeyOptions;
  /** Tempo mark visibility (default shown). */
  tempo?: TempoOptions;
  /** Measure-number visibility. Default: shown for leadsheet, hidden for projection. */
  measureNumbers?: VisibilityOption;
  /** Part/instrument label ("Melody") visibility. Default: leadsheet on, projection off. */
  partName?: VisibilityOption;
  background?: BackgroundImageOptions;
  style?: StyleOptions;
  score?: ScoreAppearance;
}

export const DEFAULT_BUILD_OPTIONS: BuildOptions = {
  chords: { visible: false },
  key: { transposeSemitones: 0 },
  tempo: { visible: true },
};
