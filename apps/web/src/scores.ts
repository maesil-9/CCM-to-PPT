/** Score discovery + UI-options → BuildOptions resolution (with validation). */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseScoreIr, type BuildOptions, type ScoreIR } from "@worship-score/core";

// Resolve scores/ relative to the repo root (apps/web/src → ../../../) so the
// server works regardless of launch cwd; WS_SCORES_DIR overrides it.
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCORES_DIR = process.env.WS_SCORES_DIR
  ? path.resolve(process.env.WS_SCORES_DIR)
  : path.resolve(MODULE_DIR, "../../../scores");

function safeId(id: string): string {
  if (!/^[\w가-힣.-]{1,64}$/.test(id) || id.includes("..")) {
    throw new Error(`잘못된 악보 id: ${id}`);
  }
  return id;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export interface ScoreSummary {
  id: string;
  title: string;
  hasBackground: boolean;
}

export async function listScores(): Promise<ScoreSummary[]> {
  let entries;
  try {
    entries = await fs.readdir(SCORES_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ScoreSummary[] = [];
  for (const d of entries) {
    if (!d.isDirectory()) continue;
    const dir = path.join(SCORES_DIR, d.name);
    if (!(await exists(path.join(dir, "score.ir.json")))) continue;
    let title = d.name;
    try {
      const score = await readScore(d.name);
      title = score.metadata.title ?? d.name;
    } catch {
      /* keep folder name */
    }
    out.push({ id: d.name, title, hasBackground: await exists(path.join(dir, "background.png")) });
  }
  return out;
}

export async function readScore(id: string): Promise<ScoreIR> {
  safeId(id);
  const raw = await fs.readFile(path.join(SCORES_DIR, id, "score.ir.json"), "utf8");
  return parseScoreIr(JSON.parse(raw));
}

export async function readBackground(id: string): Promise<Uint8Array | null> {
  safeId(id);
  const p = path.join(SCORES_DIR, id, "background.png");
  if (!(await exists(p))) return null;
  return new Uint8Array(await fs.readFile(p));
}

const hex = z.string().regex(/^[0-9A-Fa-f]{6}$/);
const textStyle = z
  .object({
    fontFace: z.string().max(64).optional(),
    fontSize: z.number().positive().max(200).optional(),
    color: hex.optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
  })
  .strict();

/** Options as the web client sends them (background is a toggle, not bytes). */
export const uiOptionsSchema = z
  .object({
    chords: z.object({ visible: z.boolean() }).strict().optional(),
    key: z.object({ transposeSemitones: z.number().int().min(-24).max(24) }).strict().optional(),
    backgroundEnabled: z.boolean().optional(),
    score: z
      .object({ inkColor: hex.optional(), lineThickness: z.number().min(0.3).max(3).optional() })
      .strict()
      .optional(),
    style: z
      .object({
        title: textStyle.optional(),
        sectionLabel: textStyle.optional(),
        backgroundColor: hex.optional(),
        card: z.object({ color: hex.optional(), opacity: z.number().min(0).max(1).optional() }).strict().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type UiOptions = z.infer<typeof uiOptionsSchema>;

export async function resolveBuildOptions(id: string, ui: unknown): Promise<Partial<BuildOptions>> {
  safeId(id);
  const v = uiOptionsSchema.parse(ui);
  const options: Partial<BuildOptions> = {};
  if (v.chords) options.chords = v.chords;
  if (v.key) options.key = v.key;
  if (v.style) options.style = v.style;
  if (v.score) options.score = v.score;
  if (v.backgroundEnabled) {
    const p = path.join(SCORES_DIR, id, "background.png");
    if (await exists(p)) {
      options.background = { data: new Uint8Array(await fs.readFile(p)), mime: "image/png" };
    }
  }
  return options;
}

/** Loads any saved options.json and returns it in the web client's UI shape. */
export async function loadUiOptions(id: string): Promise<UiOptions> {
  safeId(id);
  const file = path.join(SCORES_DIR, id, "options.json");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return {};
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
  const ui: Record<string, unknown> = {};
  if (json["chords"]) ui["chords"] = json["chords"];
  if (json["key"]) ui["key"] = json["key"];
  if (json["style"]) ui["style"] = json["style"];
  if (json["score"]) ui["score"] = json["score"];
  const bg = json["background"] as { image?: string } | undefined;
  if (bg?.image) ui["backgroundEnabled"] = true;
  const parsed = uiOptionsSchema.safeParse(ui);
  return parsed.success ? parsed.data : {};
}
