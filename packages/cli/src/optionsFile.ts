/** Loads and validates a per-score `options.json`, resolving it to BuildOptions. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  DEFAULT_PRESENTATION_PROFILE,
  PROJECTION_PRESENTATION_PROFILE,
  type BuildOptions,
  type PresentationProfile,
  type StyleOptions,
} from "@worship-score/core";

const MAX_BG_BYTES = 8 * 1024 * 1024;

const hex = z.string().regex(/^[0-9A-Fa-f]{6}$/, "hex colour without '#'");
const textStyle = z
  .object({
    fontFace: z.string().max(64).optional(),
    fontSize: z.number().positive().max(200).optional(),
    color: hex.optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
  })
  .strict();

const optionsFileSchema = z
  .object({
    chords: z.object({ visible: z.boolean().optional() }).strict().optional(),
    tempo: z.object({ visible: z.boolean().optional() }).strict().optional(),
    measureNumbers: z.object({ visible: z.boolean().optional() }).strict().optional(),
    partName: z.object({ visible: z.boolean().optional() }).strict().optional(),
    key: z.object({ transposeSemitones: z.number().int().min(-24).max(24).optional() }).strict().optional(),
    score: z
      .object({
        inkColor: hex.optional(),
        lineThickness: z.number().min(0.3).max(3).optional(),
        lyricFont: z.string().max(64).optional(),
      })
      .strict()
      .optional(),
    layout: z
      .object({
        // "projection" (default) = worship subtitle slides; "leadsheet" = printed score.
        mode: z.enum(["projection", "leadsheet"]).optional(),
        lyricSize: z.number().min(3).max(8).optional(),
        measuresPerSystem: z.number().int().min(1).max(4).optional(),
        maxSystemsPerSlide: z.number().int().min(1).max(6).optional(),
      })
      .strict()
      .optional(),
    background: z.object({ image: z.string().optional() }).strict().optional(),
    style: z
      .object({
        title: textStyle.optional(),
        sectionLabel: textStyle.optional(),
        backgroundColor: hex.optional(),
        card: z.object({ color: hex.optional(), opacity: z.number().min(0).max(1).optional() }).strict().optional(),
        textShadow: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

function detectImageMime(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export interface LoadedOptions {
  options: Partial<BuildOptions>;
  backgroundPath?: string;
  profile?: PresentationProfile;
}

export async function loadBuildOptions(scoreDir: string): Promise<LoadedOptions> {
  const file = path.join(scoreDir, "options.json");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return { options: {} };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`options.json 파싱 실패: ${(e as Error).message}`);
  }

  const parsed = optionsFileSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`options.json 형식 오류: ${msg}`);
  }
  const v = parsed.data;

  const options: Partial<BuildOptions> = {};
  if (v.chords?.visible !== undefined) options.chords = { visible: v.chords.visible };
  if (v.tempo?.visible !== undefined) options.tempo = { visible: v.tempo.visible };
  if (v.measureNumbers?.visible !== undefined) options.measureNumbers = { visible: v.measureNumbers.visible };
  if (v.partName?.visible !== undefined) options.partName = { visible: v.partName.visible };
  if (v.key?.transposeSemitones !== undefined) options.key = { transposeSemitones: v.key.transposeSemitones };
  if (v.style) options.style = v.style as StyleOptions;
  if (v.score) options.score = v.score;

  // Default to the projection (worship subtitle) layout; opt into the printed
  // leadsheet with layout.mode = "leadsheet".
  const base = v.layout?.mode === "leadsheet" ? DEFAULT_PRESENTATION_PROFILE : PROJECTION_PRESENTATION_PROFILE;
  const profile: PresentationProfile = {
    ...base,
    ...(v.layout?.lyricSize ? { lyricSize: v.layout.lyricSize } : {}),
    ...(v.layout?.measuresPerSystem ? { measuresPerSystem: v.layout.measuresPerSystem } : {}),
    ...(v.layout?.maxSystemsPerSlide ? { maxSystemsPerSlide: v.layout.maxSystemsPerSlide } : {}),
  };

  let backgroundPath: string | undefined;
  if (v.background?.image) {
    const root = path.resolve(scoreDir);
    backgroundPath = path.resolve(root, v.background.image);
    const rel = path.relative(root, backgroundPath);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`background.image는 악보 폴더 밖을 가리킬 수 없습니다: ${v.background.image}`);
    }

    let stat;
    try {
      stat = await fs.stat(backgroundPath);
    } catch {
      throw new Error(`배경 이미지 파일 없음: ${backgroundPath}`);
    }
    if (!stat.isFile()) throw new Error(`배경 이미지가 파일이 아닙니다: ${backgroundPath}`);
    if (stat.size === 0) throw new Error(`배경 이미지가 0바이트입니다: ${backgroundPath}`);
    if (stat.size > MAX_BG_BYTES) {
      throw new Error(`배경 이미지가 너무 큽니다(${stat.size} bytes > ${MAX_BG_BYTES}).`);
    }

    const data = new Uint8Array(await fs.readFile(backgroundPath));
    const mime = detectImageMime(data);
    if (!mime) throw new Error(`배경 이미지가 PNG/JPEG가 아닙니다(매직바이트 불일치): ${backgroundPath}`);
    options.background = { data, mime };
  }

  const result: LoadedOptions = { options };
  if (backgroundPath) result.backgroundPath = backgroundPath;
  if (profile) result.profile = profile;
  return result;
}
