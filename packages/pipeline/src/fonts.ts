/**
 * Bundled font configuration.
 *
 * Lyrics, chord symbols, and slide labels are TEXT — Verovio emits them as
 * `<text>` and @resvg/resvg-js rasterizes them using real font files. On a
 * headless server (Docker/CI) Korean system fonts are usually absent, so Hangul
 * would rasterize as tofu boxes. We bundle Pretendard (SIL OFL 1.1; full common
 * Hangul + Latin) and wire it as the default so output is byte-identical on any
 * machine, with `loadSystemFonts` disabled downstream.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PptxFontEmbed } from "@worship-score/core";
import type { FontConfig } from "./buildPresentation.js";

/** Internal family name of the bundled TEXT font (lyrics/labels). */
export const BUNDLED_FONT_FAMILY = "Pretendard";
/** Internal family name of the bundled MUSIC font (SMuFL engraving glyphs). */
export const BUNDLED_MUSIC_FONT_FAMILY = "Bravura";

// Pretendard renders Korean/Latin lyric & label text; Bravura is the SMuFL music
// font. Verovio emits a few glyphs (metronome note, chord-symbol accidentals) as
// <text font-family="Bravura">, which resvg can only rasterize if a real Bravura
// file is in its font list — so we bundle and load it too.
const TEXT_FONT_FILES = ["Pretendard-Regular.otf", "Pretendard-Bold.otf"];
const MUSIC_FONT_FILES = ["Bravura.otf"];

function fontPath(file: string): string {
  return fileURLToPath(new URL(`../assets/fonts/${file}`, import.meta.url));
}

/** Absolute paths of every bundled font file (text + music) present on disk. */
export function bundledFontFiles(): string[] {
  return [...TEXT_FONT_FILES, ...MUSIC_FONT_FILES].map(fontPath).filter(existsSync);
}

/**
 * Default {@link FontConfig}: the bundled Pretendard family. Returns an empty
 * config (→ system fonts) only if the bundle is somehow missing, so a build
 * never hard-fails just because the asset was stripped.
 */
export function defaultFontConfig(): FontConfig {
  const fontFiles = bundledFontFiles();
  if (fontFiles.length === 0) return {};
  return { textFontFamily: BUNDLED_FONT_FAMILY, fontFiles };
}

/**
 * Build a {@link PptxFontEmbed} from a font config by reading the regular/bold
 * font bytes from disk. Returns undefined unless both a family and at least one
 * font file are available. Used only when PPTX font embedding is opted in.
 */
export function fontEmbedFromConfig(fonts: FontConfig): PptxFontEmbed | undefined {
  const files = fonts.fontFiles ?? [];
  if (!fonts.textFontFamily || files.length === 0) return undefined;
  // Match on the filename only — a "bold" or "regular" directory segment in the
  // path must not misclassify the weight.
  const base = (f: string) => f.split(/[\\/]/).pop() ?? f;
  const regular = files.find((f) => /regular/i.test(base(f))) ?? files[0]!;
  const bold = files.find((f) => /bold/i.test(base(f)));
  return {
    family: fonts.textFontFamily,
    regular: new Uint8Array(readFileSync(regular)),
    ...(bold ? { bold: new Uint8Array(readFileSync(bold)) } : {}),
  };
}
