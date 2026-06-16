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
}

export interface BuildOptions {
  chords: ChordOptions;
  key: KeyOptions;
  background?: BackgroundImageOptions;
  style?: StyleOptions;
}

export const DEFAULT_BUILD_OPTIONS: BuildOptions = {
  chords: { visible: false },
  key: { transposeSemitones: 0 },
};
