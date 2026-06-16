/**
 * WorshipScore AI CLI (`ws`) — folder-drop a score, get a worship score PPT.
 *
 * Convention (one folder per score under `scores/`):
 *   scores/<name>/input.{png,pdf,jpg}   the original score file (optional)
 *   scores/<name>/score.ir.json         the analyzed ScoreIR (produced by analysis)
 *   scores/<name>/options.json          chords/key/background/style options
 *   scores/<name>/background.png         optional common background image
 *   scores/<name>/out/                  generated PPTX + assets
 *
 * Commands: demo | build <dir>|--all | validate <dir> | init <dir> | list | help
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  safeParseScoreIr,
  scoreIrSchema,
  validateScore,
  type ScoreIR,
  type ScoreValidationResult,
} from "@worship-score/core";
import { buildDemoScore, buildPresentation } from "@worship-score/pipeline";
import { rasterizeSvg } from "@worship-score/adapters";
import { zodToJsonSchema } from "zod-to-json-schema";
import { loadBuildOptions } from "./optionsFile.js";
import { worshipGradientSvg } from "./backgrounds.js";

const SUPPORTED_INPUT = new Set([".pdf", ".png", ".jpg", ".jpeg"]);

const SCORES_DIR = "scores";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readScoreIr(scoreDir: string): Promise<ScoreIR> {
  const file = path.join(scoreDir, "score.ir.json");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    throw new Error(`score.ir.json 없음: ${file}\n  → 먼저 악보를 분석해 score.ir.json을 생성하세요 (또는 'ws demo').`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`score.ir.json 파싱 실패: ${(e as Error).message}`);
  }
  const parsed = safeParseScoreIr(json);
  if (!parsed.success) {
    const msg = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`score.ir.json 형식 오류: ${msg}`);
  }
  return parsed.data as ScoreIR;
}

function printScoreValidation(v: ScoreValidationResult): void {
  const errors = v.issues.filter((i) => i.severity === "error" || i.severity === "fatal");
  const warns = v.issues.filter((i) => i.severity === "warning");
  console.log(`  음악 검증: blocking ${errors.length} · warning ${warns.length}`);
  for (const i of v.issues) {
    console.log(`    · ${i.severity.toUpperCase()} ${i.code} ${i.measureId ?? i.entityId ?? ""} — ${i.message}`);
  }
}

interface BuildFlags {
  embedFonts?: boolean;
}

async function cmdBuild(scoreDir: string, flags: BuildFlags = {}): Promise<void> {
  console.log(`\n[build] ${scoreDir}`);
  const score = await readScoreIr(scoreDir);
  const { options, backgroundPath, profile } = await loadBuildOptions(scoreDir);
  console.log(
    `  옵션: 코드 ${options.chords?.visible ? "표시" : "숨김"} · 전조 ${options.key?.transposeSemitones ?? 0}반음 · 배경 ${backgroundPath ? path.basename(backgroundPath) : "없음"}${flags.embedFonts ? " · 폰트임베드" : ""}`,
  );

  const result = await buildPresentation({
    score,
    options,
    ...(profile ? { profile } : {}),
    ...(flags.embedFonts ? { embedFonts: true } : {}),
  });
  printScoreValidation(result.scoreValidation);

  const outDir = path.join(scoreDir, "out");
  const assetsDir = path.join(outDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  const pptxPath = path.join(outDir, "presentation.pptx");
  await fs.writeFile(pptxPath, result.pptx.buffer);
  if (result.musicXml) await fs.writeFile(path.join(outDir, "score.musicxml"), result.musicXml, "utf8");
  for (const a of result.assets) {
    const base = `slide-${String(a.index + 1).padStart(2, "0")}`;
    await fs.writeFile(path.join(assetsDir, `${base}.png`), a.png);
    await fs.writeFile(path.join(assetsDir, `${base}.svg`), a.svg, "utf8");
    await fs.writeFile(path.join(assetsDir, `${base}.musicxml`), a.musicXml, "utf8");
  }

  const failed = result.validation.checks.filter((c) => !c.passed);
  console.log(`  슬라이드 ${result.pptx.slideCount}장 · OOXML 검증 ${result.validation.ok ? "통과 ✓" : `실패 ✗`}`);
  console.log(`  산출물: ${pptxPath}`);
  console.log(`  에셋:   ${assetsDir}`);

  if (!result.validation.ok) {
    throw new Error(`OOXML 검증 실패: ${failed.map((f) => f.name).join(", ")}`);
  }
}

async function cmdBuildAll(flags: BuildFlags = {}): Promise<void> {
  let dirs: string[];
  try {
    dirs = (await fs.readdir(SCORES_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => path.join(SCORES_DIR, d.name));
  } catch {
    console.log(`${SCORES_DIR}/ 폴더가 없습니다.`);
    return;
  }

  const targets: string[] = [];
  for (const d of dirs) if (await exists(path.join(d, "score.ir.json"))) targets.push(d);

  let ok = 0;
  const failures: string[] = [];
  for (const d of targets) {
    try {
      await cmdBuild(d, flags);
      ok++;
    } catch (e) {
      failures.push(`${d}: ${(e as Error).message}`);
      console.error(`  [실패] ${d}: ${(e as Error).message}`);
    }
  }

  console.log(`\n[build --all] 성공 ${ok}곡 · 실패 ${failures.length}곡 (대상 ${targets.length}곡)`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (failures.length > 0) process.exitCode = 1;
}

async function cmdValidate(scoreDir: string): Promise<void> {
  console.log(`\n[validate] ${scoreDir}`);
  const score = await readScoreIr(scoreDir);
  const v = validateScore(score);
  printScoreValidation(v);
  console.log(`  결과: ${v.hasBlocking ? "차단됨 ✗ (error/fatal 해결 필요)" : "승인 가능 ✓"}`);
  if (v.hasBlocking) process.exitCode = 1;
}

const OPTIONS_TEMPLATE = {
  chords: { visible: false },
  key: { transposeSemitones: 0 },
  background: { image: "background.png" },
  style: {
    title: { fontFace: "Malgun Gothic", fontSize: 28, color: "1A1A1A", bold: true },
    sectionLabel: { fontFace: "Malgun Gothic", fontSize: 16, color: "444444" },
    card: { color: "FFFFFF", opacity: 0.82 },
  },
};

const README_TEMPLATE = `# 악보 폴더

이 폴더에 악보 한 곡을 담습니다.

1. \`input.png\` (또는 .pdf/.jpg): 원본 악보 파일을 넣습니다(선택).
2. \`score.ir.json\`: 악보를 분석한 결과(ScoreIR). 분석으로 생성됩니다.
3. \`options.json\`: 코드/키/배경/스타일 옵션.
4. \`background.png\`: 공통 배경 이미지(선택).

빌드: 루트에서 \`pnpm ws build scores/<이름>\`
검증: \`pnpm ws validate scores/<이름>\`
결과: \`out/presentation.pptx\`
`;

async function cmdInit(scoreDir: string): Promise<void> {
  await fs.mkdir(scoreDir, { recursive: true });
  await fs.writeFile(path.join(scoreDir, "options.json"), JSON.stringify(OPTIONS_TEMPLATE, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(scoreDir, "README.md"), README_TEMPLATE, "utf8");
  console.log(`\n[init] ${scoreDir} 생성`);
  console.log("  options.json, README.md 작성. 이제 원본 악보를 분석해 score.ir.json을 추가하세요.");
}

async function cmdAnalyze(inputPath: string | undefined, nameArg: string | undefined): Promise<void> {
  if (!inputPath) throw new Error("입력 파일 경로가 필요합니다: ws analyze <파일> [이름]");
  const ext = path.extname(inputPath).toLowerCase();
  if (!SUPPORTED_INPUT.has(ext)) {
    throw new Error(`지원하지 않는 입력 형식: ${ext || "(없음)"} (지원: pdf, png, jpg, jpeg)`);
  }
  if (!(await exists(inputPath))) throw new Error(`입력 파일 없음: ${inputPath}`);

  const stat = await fs.stat(inputPath);
  if (!stat.isFile()) throw new Error(`파일이 아닙니다: ${inputPath}`);
  if (stat.size === 0) throw new Error("빈 파일입니다");
  if (stat.size > 50 * 1024 * 1024) throw new Error(`파일이 너무 큽니다(${stat.size} bytes > 50MB)`);
  const head = Buffer.alloc(8);
  const fh = await fs.open(inputPath, "r");
  try {
    await fh.read(head, 0, 8, 0);
  } finally {
    await fh.close();
  }
  const okMagic =
    (ext === ".pdf" && head.subarray(0, 4).toString("latin1") === "%PDF") ||
    (ext === ".png" && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) ||
    ((ext === ".jpg" || ext === ".jpeg") && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff);
  if (!okMagic) throw new Error(`파일 내용이 ${ext} 형식과 일치하지 않습니다(매직바이트 불일치)`);

  const base = nameArg ?? path.basename(inputPath, path.extname(inputPath));
  const name = base.replace(/[^\w가-힣.-]+/g, "_");
  const dir = path.join(SCORES_DIR, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(inputPath, path.join(dir, `input${ext}`));
  if (!(await exists(path.join(dir, "options.json")))) {
    await fs.writeFile(path.join(dir, "options.json"), JSON.stringify(OPTIONS_TEMPLATE, null, 2) + "\n", "utf8");
  }
  if (!(await exists(path.join(dir, "README.md")))) {
    await fs.writeFile(path.join(dir, "README.md"), README_TEMPLATE, "utf8");
  }

  console.log(`\n[analyze] ${dir} 준비 완료 (input${ext} 복사)`);
  console.log("  다음: 이 악보를 분석해 score.ir.json을 작성하세요.");
  console.log("        (세션에서 Claude에게 '이 악보 분석해줘'라고 요청 — 키/박자/템포/음표/가사/코드를 추출)");
  console.log(`  이후:  pnpm ws build ${dir}`);
  console.log("  참고:  ScoreIR 형식은 docs/worship-score/ANALYSIS_WORKFLOW.md 및 'pnpm ws schema' 참고");
}

async function cmdSchema(): Promise<void> {
  const schema = zodToJsonSchema(scoreIrSchema, "ScoreIR");
  const out = path.join("docs", "worship-score", "scoreir.schema.json");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(schema, null, 2) + "\n", "utf8");
  console.log(`\n[schema] ScoreIR JSON Schema → ${out}`);
}

async function cmdDemo(): Promise<void> {
  const dir = path.join(SCORES_DIR, "demo");
  await fs.mkdir(dir, { recursive: true });

  const score = buildDemoScore();
  await fs.writeFile(path.join(dir, "score.ir.json"), JSON.stringify(score, null, 2) + "\n", "utf8");

  const bg = rasterizeSvg(worshipGradientSvg());
  await fs.writeFile(path.join(dir, "background.png"), bg.data);

  const demoOptions = {
    chords: { visible: true },
    key: { transposeSemitones: 2 },
    background: { image: "background.png" },
    style: {
      title: { fontFace: "Malgun Gothic", fontSize: 28, color: "FFFFFF", bold: true },
      sectionLabel: { fontFace: "Malgun Gothic", fontSize: 16, color: "E8ECF7" },
      card: { color: "FFFFFF", opacity: 0.84 },
    },
  };
  await fs.writeFile(path.join(dir, "options.json"), JSON.stringify(demoOptions, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(dir, "README.md"), README_TEMPLATE, "utf8");

  console.log(`\n[demo] ${dir} 준비 완료 (코드 표시 + 2반음 전조 + 배경 이미지)`);
  console.log("  다음 실행:  pnpm ws build scores/demo");
}

async function cmdList(): Promise<void> {
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(SCORES_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    console.log(`\n${SCORES_DIR}/ 폴더가 아직 없습니다. 'pnpm ws demo' 또는 'pnpm ws init scores/<이름>'.`);
    return;
  }
  console.log(`\n[list] ${SCORES_DIR}/`);
  for (const name of entries) {
    const dir = path.join(SCORES_DIR, name);
    const hasIr = await exists(path.join(dir, "score.ir.json"));
    const hasOut = await exists(path.join(dir, "out", "presentation.pptx"));
    console.log(`  - ${name}  [${hasIr ? "분석됨" : "분석 필요"}]${hasOut ? " [PPT 있음]" : ""}`);
  }
}

function printHelp(): void {
  console.log(`
WorshipScore AI CLI

사용법:
  pnpm ws demo                  데모 악보(코드+배경+전조)를 만들고 빌드 준비
  pnpm ws analyze <파일> [이름]  PDF/이미지 악보를 폴더로 받아 분석 준비
  pnpm ws build <scoreDir>      score.ir.json + options.json → PPT 생성
  pnpm ws build --all           scores/ 안의 분석된 모든 곡을 일괄 빌드
      --embed-fonts             한글 폰트를 PPT에 임베드(제목·라벨 이식성↑, 파일↑)
  pnpm ws validate <scoreDir>   음악 검증만 실행
  pnpm ws init <scoreDir>       새 악보 폴더 템플릿 생성
  pnpm ws schema                ScoreIR JSON 스키마 내보내기
  pnpm ws list                  scores/ 목록과 상태

예시:
  pnpm ws demo
  pnpm ws build scores/demo
  pnpm ws analyze ~/Downloads/score.pdf my-song
`);
}

function requireDir(arg: string | undefined): string {
  if (!arg) {
    printHelp();
    throw new Error("scoreDir 인자가 필요합니다.");
  }
  return arg;
}

async function main(): Promise<void> {
  const [cmd, arg, arg2] = process.argv.slice(2);
  switch (cmd) {
    case "build": {
      const rest = process.argv.slice(3);
      const flags: BuildFlags = { embedFonts: rest.includes("--embed-fonts") };
      if (rest.includes("--all")) await cmdBuildAll(flags);
      else await cmdBuild(requireDir(rest.find((a) => !a.startsWith("--"))), flags);
      break;
    }
    case "validate":
      await cmdValidate(requireDir(arg));
      break;
    case "init":
      await cmdInit(requireDir(arg));
      break;
    case "analyze":
      await cmdAnalyze(arg, arg2);
      break;
    case "schema":
      await cmdSchema();
      break;
    case "demo":
      await cmdDemo();
      break;
    case "list":
      await cmdList();
      break;
    case undefined:
    case "help":
    case "-h":
    case "--help":
      printHelp();
      break;
    default:
      console.error(`알 수 없는 명령: ${cmd}`);
      printHelp();
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error("\n[CLI 실패]", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
