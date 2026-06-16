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
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FontConfig } from "./buildPresentation.js";

/** Internal family name of the bundled font (name table nameID 1/16). */
export const BUNDLED_FONT_FAMILY = "Pretendard";

const BUNDLED_FONT_FILES = ["Pretendard-Regular.otf", "Pretendard-Bold.otf"];

function fontPath(file: string): string {
  return fileURLToPath(new URL(`../assets/fonts/${file}`, import.meta.url));
}

/** Absolute paths of the bundled font files that actually exist on disk. */
export function bundledFontFiles(): string[] {
  return BUNDLED_FONT_FILES.map(fontPath).filter(existsSync);
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
