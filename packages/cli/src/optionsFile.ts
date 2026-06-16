/** Loads a per-score `options.json` and resolves it into BuildOptions. */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BuildOptions, StyleOptions } from "@worship-score/core";

interface OptionsFileShape {
  chords?: { visible?: boolean };
  key?: { transposeSemitones?: number };
  background?: { image?: string; scrim?: number };
  style?: StyleOptions;
}

export interface LoadedOptions {
  options: Partial<BuildOptions>;
  backgroundPath?: string;
}

export async function loadBuildOptions(scoreDir: string): Promise<LoadedOptions> {
  const file = path.join(scoreDir, "options.json");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return { options: {} };
  }

  let parsed: OptionsFileShape;
  try {
    parsed = JSON.parse(raw) as OptionsFileShape;
  } catch (e) {
    throw new Error(`options.json 파싱 실패: ${(e as Error).message}`);
  }

  const options: Partial<BuildOptions> = {};
  if (parsed.chords?.visible !== undefined) options.chords = { visible: parsed.chords.visible };
  if (parsed.key?.transposeSemitones !== undefined) {
    options.key = { transposeSemitones: parsed.key.transposeSemitones };
  }
  if (parsed.style) options.style = parsed.style;

  let backgroundPath: string | undefined;
  if (parsed.background?.image) {
    backgroundPath = path.resolve(scoreDir, parsed.background.image);
    const data = await fs.readFile(backgroundPath);
    const lower = backgroundPath.toLowerCase();
    const mime: "image/jpeg" | "image/png" =
      lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg" : "image/png";
    options.background = {
      data: new Uint8Array(data),
      mime,
      scrim: parsed.background.scrim ?? 0.82,
    };
  }

  return backgroundPath ? { options, backgroundPath } : { options };
}
