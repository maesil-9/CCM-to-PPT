# Requirements Traceability Matrix

> WorshipScore AI — PRD §7.2 추적성 문서
> Schema/IR 버전: `scoreir-0.1.0` · Presentation 프로파일: `profile-0.1.0`
> 기준 마일스톤: **Milestone 1 (결정적 핵심 체인 실증) 완료 시점**

## 1. 목적과 범위

이 문서는 PRD에 정의된 주요 요구사항 ID 각각에 대해 (1) 현재 구현 상태, (2) 잔여 갭, (3) 우선순위, (4) 계획된 변경, (5) 검증 테스트를 한 행으로 추적한다. WorshipScore AI는 찬양 악보 이미지/PDF를 구조화된 악보 데이터(ScoreIR)로 변환하고, 오선·멜로디·리듬·가사가 포함된 예배용 16:9 PPTX를 **새로** 조판·생성하는 상업용 SaaS이며, 본 문서의 "구현됨" 판정은 Milestone 1에서 실제 실행·검증된 산출물에만 부여한다.

판정 규칙:

- **구현됨(M1)** — Milestone 1에서 코드가 존재하고, `pnpm m1` 실행 또는 vitest 테스트로 동작이 검증됨. 근거 파일과 테스트를 함께 명시한다.
- **부분 구현(M1)** — 핵심 경로는 구현되었으나 명시된 엄격 검증(예: W3C XSD, PowerPoint 라이브 오픈)이 미완.
- **Not started(Mn)** — 미구현. 도입 예정 마일스톤을 괄호로 표기.

측정값이 확정 사실에 없는 경우 `TBD(추후 측정)`로 표기한다.

## 2. 추적성 표

### 2.1 접근성 / 계정 (ACC)

| Requirement | Current State | Gap | Priority | Planned Change | Test |
|---|---|---|---|---|---|
| ACC-001 사용자 인증/세션 | Not started (M2) | 웹 프레임워크·인증·세션 미도입. ADR-000 "빅뱅 금지" 원칙에 따라 M1에서는 웹/DB/UI 미도입. | High | M2에서 Next.js 기반 인증·세션 도입(PRD 권장 스택). | TBD(추후 측정) |
| ACC-002 권한/역할 모델 | Not started (M2) | 조직/역할/권한 데이터모델 미정의. | Medium | M2 데이터모델 및 M8 조직 라이브러리에서 권한 모델 확장. | TBD(추후 측정) |
| ACC-003 조직/멤버십 | Not started (M8) | 조직 라이브러리·멤버십 미구현. | Low | M8 조직 라이브러리/통합 PPT 단계에서 구현. | TBD(추후 측정) |

### 2.2 업로드 / 입력 파이프라인 (UPL)

| Requirement | Current State | Gap | Priority | Planned Change | Test |
|---|---|---|---|---|---|
| UPL-001 파일 업로드(이미지/PDF) | Not started (M2) | 업로드 엔드포인트·객체 저장 미구현. `ObjectStorageProvider` 인터페이스만 `packages/core/src/types/providers.ts`에 정의됨(어댑터 없음). | High | M2 업로드/작업 파이프라인에서 업로드·객체저장 어댑터 구현. | TBD(추후 측정) |
| UPL-002 MIME/형식 검사 | Not started (M2) | MIME 검사·입력 품질 게이트 미구현. | High | M2에서 MIME 검사 및 입력 품질 검사 도입. | TBD(추후 측정) |
| UPL-003 권리/사용권 확인 | Not started (M2) | 권리확인 흐름 미구현. (참고: M1 fixture는 권리 명확한 합성 멜로디 사용.) | High | M2 업로드 단계에서 권리확인 플로우 구현. | TBD(추후 측정) |
| UPL-004 작업 상태머신/멱등성/재시도 | Not started (M2) | `JobQueueProvider` 인터페이스만 정의(`providers.ts`), job state machine·idempotency·retry 어댑터 없음. | High | M2에서 job state machine·idempotency·retry 구현. | TBD(추후 측정) |

### 2.3 광학 악보 인식 (OMR)

| Requirement | Current State | Gap | Priority | Planned Change | Test |
|---|---|---|---|---|---|
| OMR-001 OMR provider 인터페이스 | Not started (M3) | `OMRProvider` 인터페이스만 `packages/core/src/types/providers.ts`에 정의됨. 구현/mock 없음. | High | M3 기술검증에서 provider interface + mock 구현. | TBD(추후 측정) |
| OMR-002 후보 엔진 spike | Not started (M3) | 후보 엔진 평가 미수행. 실행환경에 Java 없음 → Audiveris/MuseScore CLI 현재 사용 불가. | High | M3에서 후보 엔진 spike 및 환경 의존성 확보. | TBD(추후 측정) |
| OMR-003 골든셋/품질 측정 | Not started (M3) | 골든셋·품질/비용/시간 측정 체계 미구축. | High | M3에서 골든셋 구성 및 품질/비용/시간 측정. | TBD(추후 측정) |
| OMR-004 Audiveris AGPL 게이트 | Not started (M3) | Audiveris(AGPL-3.0) 미도입. 법무 승인 전 프로덕션 경로 금지. 별도 worker 분리만으로 AGPL 의무가 자동 해소된다고 가정하지 않음. | High | M3에서 AGPL 라이선스 게이트 및 법무 승인 절차 적용. | TBD(추후 측정) |
| OMR-005 OMR→ScoreIR 변환 | Not started (M3) | OMR 출력→ScoreIR 매핑 미구현. (목표 IR인 ScoreIR은 M1에서 구현 완료되어 변환 타깃은 확정.) | High | M3에서 OMR 출력→ScoreIR(`scoreir-0.1.0`) 변환 구현. | TBD(추후 측정) |

### 2.4 구조화 악보 데이터 — ScoreIR (SCR)

| Requirement | Current State | Gap | Priority | Planned Change | Test |
|---|---|---|---|---|---|
| SCR-001 ScoreIR 데이터 모델 | **구현됨(M1)** — `packages/core/src/types/scoreir.ts`. `SCOREIR_SCHEMA_VERSION='scoreir-0.1.0'`, Pitch/Duration/Key/Time/Clef/Lyric/Note/Rest/Measure/ScoreSection/PresentationItem/SourceRegion/EvidenceSource/ScoreUncertainty/MusicalContext/ScorePart/ScoreIR 정의. zod 스키마 `packages/core/src/schema/scoreir.schema.ts`(`parseScoreIr`/`safeParseScoreIr`). | 영속화·immutable revision·property test 강화는 미완(M4). | High | M4에서 ScoreIR 영속화/immutable revision/property test 도입. | `packages/core/test/schema.test.ts`; M1 체인에서 zod 스키마 통과 확인(`pnpm m1`). vitest core 21건 일부. |
| SCR-002 악보 검증(규칙) | **구현됨(M1)** — `packages/core/src/validation/index.ts` `validateScore()` 12개 규칙. 이슈 모델 `packages/core/src/types/validation.ts`(`ScoreValidationIssue` severity info/warning/error/fatal, `ScoreValidationResult`). M1 실행 시 blocking 0/warning 0. | 규칙 집합은 `scoreir-0.1.0` 기준. 향후 IR 진화 시 규칙 확장 필요. | High | IR 버전 진화에 맞춰 규칙 확장(M4+). | `packages/core/test/validation.test.ts`; `pnpm m1`에서 검증 blocking 0/warning 0. |
| SCR-003 MusicXML 직렬화 | **부분 구현(M1)** — `packages/core/src/musicxml/{serialize.ts,xml.ts}` 결정적 ScoreIR→MusicXML 4.0 score-partwise. 마디 부분집합/절 필터 지원, 부분집합 첫 마디에 full attributes 재기재. M1 산출물 `out/score.musicxml`, MusicXML 11806 bytes(결정적). | **엄격한 W3C MusicXML XSD 검증 미구현.** 현재는 구조 검증 + Verovio 라운드트립(로드 성공)으로 대체. XSD 번들 도입 미완. | High | XSD 번들 도입 및 스키마 검증 추가(추후). | `packages/core/test/musicxml.test.ts`; `pnpm m1`에서 결정적 바이트 수 확인 + Verovio 6.2.0 로드 성공. |

### 2.5 런타임 AI 분석/검증 (AIA)

| Requirement | Current State | Gap | Priority | Planned Change | Test |
|---|---|---|---|---|---|
| AIA-001 model provider/tool contract | Not started (M5) | `VisionReviewProvider` 인터페이스만 `providers.ts`에 정의. model provider·tool contracts 미구현. | Medium | M5 런타임 AI 검증에서 model provider·tool contracts 구현. | TBD(추후 측정) |
| AIA-002 structured output | Not started (M5) | 구조화 출력 계약 미구현(목표 출력 형식인 ScoreIR/검증 이슈 모델은 확정). | Medium | M5에서 structured output 계약 구현. | TBD(추후 측정) |
| AIA-003 prompt injection 방어 | Not started (M5) | 프롬프트 인젝션 방어 미구현. | Medium | M5에서 prompt injection 방어 도입. | TBD(추후 측정) |

### 2.6 검수 / 리뷰 UI (REV)

| Requirement | Current State | Gap | Priority | Planned Change | Test |
|---|---|---|---|---|---|
| REV-001 3열 검수 UI | Not started (M6) | UI 미도입(ADR-000: M1 UI 미도입). | Medium | M6 검수 UI(3열) 구현. | TBD(추후 측정) |
| REV-002 원본↔IR 대조(증거) | Not started (M6) | UI 미구현. (IR에 `SourceRegion`/`EvidenceSource` 모델은 `scoreir.ts`에 존재해 검수 근거 표현 가능.) | Medium | M6에서 SourceRegion/EvidenceSource 기반 대조 뷰 구현. | TBD(추후 측정) |
| REV-003 불확실성 표시 | Not started (M6) | UI 미구현. (IR에 `ScoreUncertainty` 모델 존재.) | Medium | M6에서 ScoreUncertainty 시각화. | TBD(추후 측정) |
| REV-004 수정/재검증 루프 | Not started (M6) | UI·편집 루프 미구현. (도메인 `validateScore()`는 재호출 가능.) | Medium | M6에서 편집→재검증 루프 연결. | TBD(추후 측정) |
| REV-005 검수 승인/상태 전이 | Not started (M6) | 승인 상태 전이 미구현. | Medium | M6/M2 job 상태머신과 연계해 승인 전이 구현. | TBD(추후 측정) |

### 2.7 구조 분석 / 발표 구성 (STR)

| Requirement | Current State | Gap | Priority | Planned Change | Test |
|---|---|---|---|---|---|
| STR-001 섹션/구조 모델 | **부분 구현(M1)** — `ScoreSection`/`PresentationItem` 타입(`scoreir.ts`)과 `planPresentation()`(`packages/core/src/presentation/slidePlan.ts`)에서 섹션 경계 우선 분할·마디 미분할 적용. M1 fixture는 verse+chorus, chorus repeat 구조 포함. | 자동 구조 추론(반복·D.C./D.S. 등 고급 구조) 및 사용자 편집은 미완. | Medium | M7 발표구성에서 구조 편집·템플릿 연계. | `packages/core/test/slidePlan.test.ts`; `packages/pipeline/test/fixture.test.ts`. |
| STR-002 발표 프로파일 | **부분 구현(M1)** — `DEFAULT_PRESENTATION_PROFILE`(`profile-0.1.0`, `packages/core/src/presentation/profile.ts`), 타입 `packages/core/src/types/presentation.ts`(`PresentationProfile`/`SlidePlan`/`SlidePlanSlide`). `perSlide = measuresPerSystem * maxSystemsPerSlide`. | 다중 프로파일/템플릿 선택·커스터마이즈 미구현. | Medium | M7 템플릿/PPT에서 프로파일 다양화. | `packages/core/test/slidePlan.test.ts`. |

### 2.8 렌더링 — 오선/SVG/PNG (RND)

| Requirement | Current State | Gap | Priority | Planned Change | Test |
|---|---|---|---|---|---|
| RND-001 악보 SVG 렌더링 | **구현됨(M1)** — `packages/adapters/src/verovio/renderer.ts` `VerovioRenderer implements RendererProvider`, verovio 6.2.0 WASM(MusicXML→SVG). `RendererProvider` 계약은 `packages/core/src/types/providers.ts`. | Domain은 엔진 직접 import 금지 원칙 준수(어댑터 격리). | High | M3+에서 OMR/추가 렌더 옵션과 통합. | `packages/pipeline/test/e2e.test.ts`(render→pptx→ooxml); `pnpm m1`에서 Verovio 6.2.0 정상. |
| RND-002 SVG→PNG 래스터화 | **구현됨(M1)** — `renderer.ts`에서 @resvg/resvg-js 2.6.2로 SVG→PNG. M1 산출물 PNG 4장 2400×314px(결정적). | **크로스-머신 폰트 결정성 미보장**(resvg 시스템 폰트 사용) — 가사 텍스트 폰트 임베드/고정 추후. | High | 폰트 임베드/고정 도입(추후). | `packages/pipeline/test/e2e.test.ts`; `pnpm m1`에서 PNG 2400×314px·결정적 확인. |
| RND-003 결정적 렌더(runId) | **부분 구현(M1)** — `renderer.ts` `runId`는 입력 해시(FNV-1a)로 결정적. ScoreIR→SVG/PNG는 동일 머신에서 결정적(검증됨). | 크로스-머신 결정성은 폰트 의존으로 미보장(RND-002 갭과 연동). | High | 폰트 고정 후 크로스-머신 결정성 확보(추후). | `packages/pipeline/test/e2e.test.ts`; `pnpm m1` 결정성 확인(동일 머신). |
| RND-004 멀티시스템/페이지 레이아웃 | **부분 구현(M1)** — slide plan 기반으로 슬라이드별 마디 분할 렌더(M1 4슬라이드). 고급 페이지/시스템 레이아웃 옵션은 미완. | 시스템당 마디수·페이지 분할 등 고급 레이아웃 커스터마이즈 미구현. | Medium | M7에서 레이아웃 옵션 확장. | `packages/core/test/slidePlan.test.ts`; `pnpm m1` 4슬라이드. |

### 2.9 PPTX 생성 / 검증 (PPT)

| Requirement | Current State | Gap | Priority | Planned Change | Test |
|---|---|---|---|---|---|
| PPT-001 PPTX 생성(16:9) | **구현됨(M1)** — `packages/adapters/src/pptx/builder.ts` `PptxGenJsBuilder implements PptxBuilder`, pptxgenjs 4.0.1, 16:9(13.333×7.5in). 계약 `PptxBuilder`(`providers.ts`). M1 산출물 `out/worship-score-sample.pptx`(213,481 bytes, 4슬라이드). | — | High | M7 템플릿/M8 통합 PPT에서 확장. | `packages/pipeline/test/e2e.test.ts`; `pnpm m1`에서 PPTX 213,481 bytes·4슬라이드. |
| PPT-002 이미지 배치(잘림 0) | **구현됨(M1)** — `builder.ts`에서 PNG를 안전여백 박스 contain-fit 배치(요소 잘림 0). | — | High | 레이아웃 옵션 확장(M7). | `packages/pipeline/test/e2e.test.ts`; M1 슬라이드 PNG 시각 확인(자리표·박자·음표·마디선·한글 가사 정확 렌더). |
| PPT-003 OOXML 구조 검증 | **부분 구현(M1)** — `packages/adapters/src/pptx/ooxml.ts` `validatePptxOoxml`(jszip 3.10.1 + fast-xml-parser 5.8.0). M1에서 13개 항목 전부 통과: zip_loadable, content_types_present, root_rels_present, presentation_xml_present, presentation_rels_present, slides_present, slide_count_match, slide_master_present, slide_layout_present, media_present, all_xml_well_formed, relationship_targets_resolve, each_slide_has_image. | **실제 PowerPoint '수리 경고 없이 열기' 라이브 테스트 미실행**(머신에 Office 없음) — 수동/CI 절차로 추적. | High | PowerPoint 라이브 오픈 검증을 수동/CI 절차로 도입(추후). | `packages/adapters` OOXML 경로 + `packages/pipeline/test/e2e.test.ts`(render→pptx→ooxml); `pnpm m1` 13/13 통과. |
| PPT-004 PPTX 결정성/재현성 | **부분 구현(M1)** — 체인 산출물은 동일 입력→동일 슬라이드 구성으로 재현. | **PPTX 바이트 단위 결정성 미보장** — pptxgenjs가 생성 타임스탬프 삽입. 정규화 후처리 미구현. | Medium | 타임스탬프 정규화 후처리 도입(추후). | `packages/pipeline/test/e2e.test.ts`; 바이트 결정성은 `TBD(추후 측정)`. |

### 2.10 데이터 모델 (PRD 13장)

| Requirement | Current State | Gap | Priority | Planned Change | Test |
|---|---|---|---|---|---|
| DATA-001 ScoreIR 스키마/버전 | **구현됨(M1)** — `scoreir.ts`(`SCOREIR_SCHEMA_VERSION='scoreir-0.1.0'`) + zod 스키마 `schema/scoreir.schema.ts`. 부수 모델: `duration.ts`(`DEFAULT_DIVISIONS=8`, eventDurationDivisions/measureDurationDivisions), `context.ts`(`computeActiveAttributes` — 마디별 활성 key/time/clef/divisions). | 영속 저장 스키마(DB) 미정의. | High | M4 ScoreIR 영속화/immutable revision에서 저장 스키마 정의. | `packages/core/test/{schema.test.ts,duration.test.ts}`. |
| DATA-002 영속화/불변 리비전 | Not started (M4) | DB·immutable revision·property test 강화 미구현(M1은 DB 미도입). | High | M4에서 영속화/immutable revision/property test 강화. | TBD(추후 측정) |
| DATA-003 산출물/미디어 저장 | Not started (M2) | `ObjectStorageProvider` 인터페이스만 정의. 산출물(MusicXML/PNG/PPTX)은 현재 로컬 `out/` 파일로만 기록(`packages/pipeline/src/m1.ts`). | Medium | M2 객체저장 어댑터로 산출물 영속화. | TBD(추후 측정) |

### 2.11 보안 / 컴플라이언스 (PRD 13장)

| Requirement | Current State | Gap | Priority | Planned Change | Test |
|---|---|---|---|---|---|
| SEC-001 인증/인가 | Not started (M2/M5) | 인증·인가 미구현(웹/DB 미도입). | High | M2 인증, M5 AI 경로 보안에서 도입. | TBD(추후 측정) |
| SEC-002 prompt injection 방어 | Not started (M5) | LLM 입력 방어 미구현(AIA-003과 동일 항목). | Medium | M5에서 prompt injection 방어. | TBD(추후 측정) |
| SEC-003 입력 검증/MIME 게이트 | Not started (M2) | 업로드 입력 검증·MIME 게이트 미구현(UPL-002와 연동). | High | M2 업로드 입력 품질·MIME 검사. | TBD(추후 측정) |
| SEC-004 감사 로그/백업 | Not started (M9) | 감사로그·백업 미구현. | Medium | M9 상업화에서 감사로그/백업 도입. | TBD(추후 측정) |
| SEC-005 SBOM/라이선스 승인 | Not started (M9) | SBOM 자동화·라이선스 승인 절차 미구축. (현 의존성 라이선스는 본 문서 §3에 인벤토리화.) | High | M9에서 SBOM 생성 및 라이선스 승인 게이트. | TBD(추후 측정) |
| SEC-006 AGPL(Audiveris) 게이트 | Not started (M3/M9) | Audiveris(AGPL-3.0)는 의존성에 미추가. 법무 승인 전 프로덕션 경로 금지. worker 분리만으로 AGPL 의무 자동 해소 가정 금지. | High | M3 기술 게이트 + M9 법무 승인 절차. | TBD(추후 측정) |

## 3. 의존성 라이선스 인벤토리 (확정)

현재(M1) 의존성과 SPDX 라이선스. SBOM 자동화 및 승인 게이트는 M9 범위.

| Package | Version | SPDX / License | 비고 |
|---|---|---|---|
| verovio | 6.2.0 | LGPL-3.0-or-later | MusicXML→SVG (WASM) |
| @resvg/resvg-js | 2.6.2 | MPL-2.0 | SVG→PNG |
| pptxgenjs | 4.0.1 | MIT | PPTX 생성 |
| jszip | 3.10.1 | MIT OR GPL-3.0-or-later → **MIT 선택** | OOXML 검증 |
| fast-xml-parser | 5.8.0 | MIT | OOXML 검증 |
| zod | 3.25.76 | MIT | 스키마 |
| tsx | 4.22.4 | MIT | 런타임 실행 |
| vitest | 2.1.9 | MIT | 테스트 |
| typescript | 5.9.3 | Apache-2.0 | 타입체크 |
| Audiveris | — | AGPL-3.0 | **미추가.** 법무 승인 전 프로덕션 경로 금지(worker 분리로 자동 해소 가정 금지). M3 게이트. |

## 4. Milestone 1 검증 근거 요약 (확정)

- 체인: ScoreIR → zod schema → `validateScore` → MusicXML 4.0 → Verovio(SVG+PNG) → slide plan → PptxGenJS PPTX → OOXML 검증 → preview(PNG).
- `pnpm m1`: 스키마 통과, 검증 blocking 0 / warning 0, MusicXML 11806 bytes(결정적), 슬라이드 4장, Verovio 6.2.0 정상, PNG 4장(2400×314px, 결정적), PPTX `out/worship-score-sample.pptx`(213,481 bytes, 4슬라이드).
- OOXML 검증 13개 항목 전부 통과(§2.9 PPT-003 참조).
- 시각 확인: 슬라이드 PNG에 높은음자리표·4/4·멜로디 음표·마디선·한글 가사 정확 렌더(악보형 PPT 실증, 가사 자막형 아님).
- 테스트: vitest 27건 전부 통과(core 21 + pipeline fixture 5 + e2e 1). `tsc -p tsconfig.json` 타입체크 clean.

## 5. 알려진 한계 (정직 기재, 확정)

1. **PPTX 바이트 결정성 미보장** — pptxgenjs 생성 타임스탬프 삽입. 정규화 후처리 추후(PPT-004).
2. **엄격 W3C MusicXML XSD 미구현** — 구조 검증 + Verovio 라운드트립(로드 성공)으로 대체. XSD 번들 추후(SCR-003).
3. **PowerPoint 라이브 오픈 미검증** — 머신에 Office 없음. 수동/CI 절차로 추적(PPT-003).
4. **크로스-머신 폰트 결정성 미보장** — resvg 시스템 폰트 사용. 폰트 임베드/고정 추후(RND-002/003).

## 6. 마일스톤 매핑 (참고)

| Milestone | 범위 요약 | 본 문서의 주요 행 |
|---|---|---|
| M1 (완료) | 결정적 핵심 체인 실증 | SCR-001/002/003, RND-001~004, PPT-001~004, STR-001/002, DATA-001 |
| M2 | 업로드/작업 파이프라인 | ACC-001/002, UPL-001~004, DATA-003, SEC-001/003 |
| M3 | OMR 기술검증(AGPL 게이트 포함) | OMR-001~005, SEC-006 |
| M4 | ScoreIR 영속화/immutable revision/property test | DATA-002 |
| M5 | 런타임 AI 검증 | AIA-001~003, SEC-002 |
| M6 | 검수 UI(3열) | REV-001~005 |
| M7 | 발표구성/템플릿/PPT | STR-001/002, RND-004 확장, PPT 템플릿 |
| M8 | 조직 라이브러리/통합 PPT | ACC-003 |
| M9 | 상업화(과금/감사로그/백업/SBOM/라이선스 승인) | SEC-004/005, SEC-006(승인) |

---

*근거 파일 경로는 모노레포 루트 기준 상대 경로(`packages/...`)로 표기. 측정값이 확정되지 않은 항목은 `TBD(추후 측정)`로 표기한다.*
