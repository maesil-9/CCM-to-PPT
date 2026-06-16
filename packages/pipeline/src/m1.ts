/**
 * Milestone 1 — deterministic output chain runner (PRD PART II §8 Milestone 1,
 * §22 step 11).
 *
 *   ScoreIR -> schema check -> music validation -> MusicXML -> renderer (SVG+PNG)
 *           -> slide plan -> PPTX -> OOXML validation -> preview
 *
 * Produces real artifacts under /out and fails loudly if any stage does not
 * hold. Nothing is reported as done that was not actually executed (PRD §5.2).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_PRESENTATION_PROFILE,
  parseScoreIr,
  planPresentation,
  serializeMusicXml,
  validateScore,
  type PptxSlideSpec,
} from "@worship-score/core";
import { PptxGenJsBuilder, VerovioRenderer } from "@worship-score/adapters";

import { buildCleanDigitalSample } from "./fixtures/cleanDigitalSample.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
const OUT_DIR = path.resolve(REPO_ROOT, "out");
const ASSET_DIR = path.resolve(OUT_DIR, "assets");

function log(step: string, msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`  [${step}] ${msg}`);
}

async function main(): Promise<void> {
  console.log("\n=== WorshipScore AI · Milestone 1 결정적 출력 체인 ===\n");
  await fs.mkdir(ASSET_DIR, { recursive: true });

  // 0. Fixture + schema validation
  const score = buildCleanDigitalSample();
  parseScoreIr(score);
  log("schema", `ScoreIR 스키마 검증 통과 (scoreId=${score.scoreId}, 마디 ${score.measures.length})`);

  // 1. Music validation — must have no error/fatal
  const validation = validateScore(score);
  const blocking = validation.issues.filter((i) => i.severity === "error" || i.severity === "fatal");
  const warnings = validation.issues.filter((i) => i.severity === "warning");
  log("validate", `규칙 검증: blocking ${blocking.length}건, warning ${warnings.length}건`);
  for (const i of validation.issues) {
    log("validate", `  · ${i.severity.toUpperCase()} ${i.code} ${i.measureId ?? i.entityId ?? ""} — ${i.message}`);
  }
  if (validation.hasBlocking) {
    throw new Error(`음악 검증 실패: ${blocking.length}건의 error/fatal로 승인·생성 차단 (PPT-003)`);
  }

  // 2. MusicXML (full score) + determinism check
  const fullXml = serializeMusicXml(score);
  const fullXml2 = serializeMusicXml(score);
  if (fullXml !== fullXml2) throw new Error("MusicXML 직렬화가 비결정적입니다");
  await fs.writeFile(path.resolve(OUT_DIR, "score.musicxml"), fullXml, "utf8");
  log("musicxml", `MusicXML 4.0 생성 (${fullXml.length} bytes, 결정적 확인)`);

  // 3. Slide plan
  const profile = DEFAULT_PRESENTATION_PROFILE;
  const plan = planPresentation(score, profile);
  log("slideplan", `슬라이드 계획 ${plan.slides.length}장 (profile=${plan.profileVersion})`);

  // 4. Render each slide (PNG for embedding, SVG asset alongside)
  const renderer = await VerovioRenderer.create();
  const health = await renderer.healthCheck();
  log("renderer", `Verovio ${renderer.providerVersion} healthy=${health.ok}`);

  const slideSpecs: PptxSlideSpec[] = [];
  for (const slide of plan.slides) {
    const xml = serializeMusicXml(score, {
      measureIds: slide.measureIds,
      ...(slide.verse !== undefined ? { verses: [slide.verse] } : {}),
    });

    const pngResult = await renderer.renderScore({ musicXml: xml, outputMode: "png", options: { scale: 2 } });
    const pngResult2 = await renderer.renderScore({ musicXml: xml, outputMode: "png", options: { scale: 2 } });
    const page = pngResult.pages[0];
    const page2 = pngResult2.pages[0];
    if (!page?.png || !page2?.png) throw new Error(`슬라이드 ${slide.index} PNG 렌더 실패`);
    if (Buffer.compare(Buffer.from(page.png), Buffer.from(page2.png)) !== 0) {
      throw new Error(`슬라이드 ${slide.index} PNG 렌더가 비결정적입니다`);
    }

    const svgResult = await renderer.renderScore({ musicXml: xml, outputMode: "svg" });
    const svg = svgResult.pages[0]?.svg ?? "";

    const base = `slide-${String(slide.index + 1).padStart(2, "0")}`;
    await fs.writeFile(path.resolve(ASSET_DIR, `${base}.png`), page.png);
    await fs.writeFile(path.resolve(ASSET_DIR, `${base}.svg`), svg, "utf8");
    await fs.writeFile(path.resolve(ASSET_DIR, `${base}.musicxml`), xml, "utf8");

    const spec: PptxSlideSpec = {
      index: slide.index,
      image: { data: page.png, mime: "image/png", widthPx: page.widthPx, heightPx: page.heightPx },
    };
    if (slide.title) spec.title = slide.title;
    if (slide.sectionLabel) spec.sectionLabel = slide.sectionLabel;
    slideSpecs.push(spec);

    log("render", `${base}: ${page.widthPx}x${page.heightPx}px (${slide.sectionLabel ?? ""}${slide.verse ? " v" + slide.verse : ""})`);
  }

  // 5. PPTX generation
  const builder = new PptxGenJsBuilder();
  const pptx = await builder.generate({
    metadata: {
      ...(score.metadata.title ? { title: score.metadata.title } : {}),
      ...(score.metadata.copyright ? { copyright: score.metadata.copyright } : {}),
    },
    profile: {
      slideWidthInches: profile.slideWidthInches,
      slideHeightInches: profile.slideHeightInches,
      safeMarginInches: profile.safeMarginInches,
    },
    slides: slideSpecs,
  });
  const pptxPath = path.resolve(OUT_DIR, "worship-score-sample.pptx");
  await fs.writeFile(pptxPath, pptx.buffer);
  log("pptx", `${builder.builderName} ${builder.builderVersion} → ${path.relative(REPO_ROOT, pptxPath)} (${pptx.buffer.byteLength} bytes, ${pptx.slideCount} slides)`);

  // 6. OOXML validation
  const result = await builder.validate({ buffer: pptx.buffer, expectedSlideCount: pptx.slideCount });
  console.log("\n--- OOXML 검증 (PPT-004) ---");
  for (const c of result.checks) {
    console.log(`  ${c.passed ? "✓" : "✗"} ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
  }

  console.log("\n=== 결과 ===");
  console.log(`  산출물: ${path.relative(REPO_ROOT, pptxPath)}`);
  console.log(`  슬라이드 에셋: ${path.relative(REPO_ROOT, ASSET_DIR)} (PNG/SVG/MusicXML)`);
  console.log(`  OOXML 검증: ${result.ok ? "통과 ✓" : "실패 ✗"}`);
  console.log(`  남은 수동 검증: 실제 PowerPoint 열기(수리 경고 없음) — Office 필요, 미실행`);
  console.log("");

  if (!result.ok) {
    throw new Error("PPTX OOXML 검증 실패 — 다운로드 상태로 전환 불가 (PPT-004)");
  }
}

main().catch((err: unknown) => {
  console.error("\n[M1 실패]", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
