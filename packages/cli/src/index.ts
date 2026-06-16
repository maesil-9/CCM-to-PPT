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
  validateScore,
  type ScoreIR,
  type ScoreValidationResult,
} from "@worship-score/core";
import { buildDemoScore, buildPresentation } from "@worship-score/pipeline";
import { rasterizeSvg } from "@worship-score/adapters";
import { loadBuildOptions } from "./optionsFile.js";
import { worshipGradientSvg } from "./backgrounds.js";

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

async function cmdBuild(scoreDir: string): Promise<void> {
  console.log(`\n[build] ${scoreDir}`);
  const score = await readScoreIr(scoreDir);
  const { options, backgroundPath } = await loadBuildOptions(scoreDir);
  console.log(
    `  옵션: 코드 ${options.chords?.visible ? "표시" : "숨김"} · 전조 ${options.key?.transposeSemitones ?? 0}반음 · 배경 ${backgroundPath ? path.basename(backgroundPath) : "없음"}`,
  );

  const result = await buildPresentation({ score, options });
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

async function cmdBuildAll(): Promise<void> {
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
      await cmdBuild(d);
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
  pnpm ws build <scoreDir>      score.ir.json + options.json → PPT 생성
  pnpm ws build --all           scores/ 안의 분석된 모든 곡을 일괄 빌드
  pnpm ws validate <scoreDir>   음악 검증만 실행
  pnpm ws init <scoreDir>       새 악보 폴더 템플릿 생성
  pnpm ws list                  scores/ 목록과 상태

예시:
  pnpm ws demo
  pnpm ws build scores/demo
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
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "build":
      if (arg === "--all") await cmdBuildAll();
      else await cmdBuild(requireDir(arg));
      break;
    case "validate":
      await cmdValidate(requireDir(arg));
      break;
    case "init":
      await cmdInit(requireDir(arg));
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
