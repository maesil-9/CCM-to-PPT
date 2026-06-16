# IMPLEMENTATION_PLAN.md

WorshipScore AI 구현 계획서. 본 문서는 PRD §7.4(구현 계획 형식)와 구현 프롬프트 §8(Milestone 1~9)을 근거로, 결정적 출력 체인을 먼저 증명한 뒤 단계적으로 SaaS 전체를 조립하는 순서를 기록한다.

WorshipScore AI는 찬양 악보 이미지/PDF를 구조화된 악보 데이터(ScoreIR)로 변환하고, 오선·멜로디·리듬·가사를 포함한 예배용 16:9 PPTX를 **새로 조판·생성**하는 상업용 SaaS다. 가사 자막형 PPT가 아니라 악보형 PPT를 산출하는 점이 제품의 핵심 차별점이다.

---

## 0. 현재 상태 요약

### 0.1 한눈에 보는 진행도

| Milestone | 범위 | 상태 |
| --- | --- | --- |
| M1 | 결정적 출력 체인 (ScoreIR→…→PPTX→OOXML 검증→preview) | **완료** |
| M2 | 업로드와 작업 파이프라인 | 계획됨 |
| M3 | OMR 기술 검증 | 계획됨 |
| M4 | ScoreIR 영속화와 구조 검증 강화 | 계획됨 |
| M5 | 런타임 AI 검증 | 계획됨 |
| M6 | 검수 UI (3열) | 계획됨 |
| M7 | 발표 구성과 PPT | 계획됨 |
| M8 | 조직 라이브러리와 통합 PPT | 계획됨 |
| M9 | 상업화 | 계획됨 |

### 0.2 채택된 원칙 (ADR-000)

"빅뱅 금지 / Milestone 1 우선 증명" 원칙에 따라, 핵심 결정적 체인을 먼저 구현하고 웹 프레임워크·DB·UI는 도입하지 않았다. Next.js 16 / PostgreSQL / Chakra UI 3 등 PRD §6 권장 스택은 Milestone 2 이후에 도입한다.

레이어 규약은 다음과 같으며, Domain은 외부 엔진/SDK(Next.js, DB driver, Redis client, S3 SDK, Claude SDK, OMR 구현체, 렌더러, PptxGenJS)를 직접 import하지 않는다.

```text
UI
→ Application Use Cases
→ Domain
→ Provider Interfaces
→ Infrastructure Adapters
```

### 0.3 실행 환경 (확정)

- OS: Windows 11 Pro
- Node v22.21.0, pnpm 11.5.2, Python 3.12.10
- Java 없음 → Audiveris/MuseScore CLI 현 단계 사용 불가 (OMR은 M3 범위이므로 현 단계 무관)

### 0.4 채택 스택 (확정)

- pnpm 워크스페이스 모노레포
- TypeScript strict (NodeNext ESM, `noUncheckedIndexedAccess` 등)
- 런타임 실행: tsx / 테스트: vitest / 스키마: zod

### 0.5 다음 최우선 작업

M1은 완료 상태이나, 완전한 프로덕션 신뢰성을 위해 아래 잔여 항목과 M2 착수 중 우선순위를 정한다. M1 잔여 항목은 M2 본체와 병렬 처리 가능하며, 그 자체로는 신규 인프라 의존성을 만들지 않으므로 먼저 정리하는 것을 권고한다.

1. **MusicXML XSD 엄격 검증 도입 (M1 잔여)** — 현재는 구조 검증 + Verovio 라운드트립(로드 성공)으로 대체 중. W3C MusicXML 4.0 XSD 번들을 추가하여 스키마 단위 검증을 추가한다.
2. **PPTX 결정성 정규화 (M1 잔여)** — pptxgenjs가 생성 타임스탬프를 삽입하므로 PPTX는 바이트 단위로 결정적이지 않다. ZIP 내부 타임스탬프/메타데이터를 정규화하는 후처리 단계를 도입한다.
3. **PowerPoint 라이브 검증 절차 (M1 잔여)** — 머신에 Office가 없어 '수리 경고 없이 열기' 라이브 테스트가 미실행. CI 또는 수동 절차로 추적한다.
4. **M2 업로드/작업 파이프라인 착수** — 위 잔여 항목과 병렬로 진행 가능.

---

## Milestone 1 — 결정적 출력 체인 (완료)

### 목표

OMR보다 먼저, 권리가 명확한 고정 ScoreIR 샘플로 다음 체인을 끝까지 증명한다. 동일 입력에 대해 결정적 결과를 내고, 산출 PPTX가 악보형(오선·멜로디·리듬·가사 포함)으로 실제 렌더됨을 시각 확인한다.

```text
ScoreIR
→ zod schema
→ validateScore
→ MusicXML 4.0
→ Verovio (SVG + PNG)
→ slide plan
→ PptxGenJS PPTX
→ OOXML validation
→ preview (PNG)
```

### 변경 파일 (실제 존재)

세 개의 워크스페이스 패키지로 구성된다.

**packages/core (`@worship-score/core`) — Domain. 외부 엔진 import 없음.**

- `src/types/scoreir.ts` — ScoreIR 타입군. `SCOREIR_SCHEMA_VERSION = "scoreir-0.1.0"`. 포함 타입: Pitch / Duration / Key / Time / Clef / Lyric / Note / Rest / Measure / ScoreSection / PresentationItem / SourceRegion / EvidenceSource / ScoreUncertainty / MusicalContext / ScorePart / ScoreIR.
- `src/types/validation.ts` — ScoreValidationIssue (severity: `info` | `warning` | `error` | `fatal`), ScoreValidationResult.
- `src/types/presentation.ts` — PresentationProfile, SlidePlan, SlidePlanSlide.
- `src/types/providers.ts` — RendererProvider, PptxBuilder, VisionReviewProvider, OMRProvider, ObjectStorageProvider, JobQueueProvider (및 RenderScoreInput/Result, GeneratePptxInput, PptxValidationResult 등 보조 타입).
- `src/duration.ts` — `eventDurationDivisions` / `measureDurationDivisions`, `DEFAULT_DIVISIONS = 8` (divisions per quarter).
- `src/context.ts` — `computeActiveAttributes` (마디별 활성 key/time/clef/divisions 계산).
- `src/validation/index.ts` — `validateScore()` (12개 규칙 구현).
- `src/musicxml/xml.ts`, `src/musicxml/serialize.ts` — 결정적 ScoreIR → MusicXML 4.0 score-partwise 직렬화. 마디 부분집합/절 필터 지원, 부분집합 첫 마디에 full attributes 재기재.
- `src/presentation/profile.ts`, `src/presentation/slidePlan.ts` — `DEFAULT_PRESENTATION_PROFILE` (`PRESENTATION_PROFILE_VERSION = "profile-0.1.0"`), `planPresentation()` (섹션 경계 우선 분할, 마디 미분할, `perSlide = measuresPerSystem * maxSystemsPerSlide`).
- `src/schema/scoreir.schema.ts` — zod 스키마 + `parseScoreIr` / `safeParseScoreIr`.

**packages/adapters (`@worship-score/adapters`) — Infrastructure.**

- `src/verovio/renderer.ts` — `VerovioRenderer implements RendererProvider`. verovio 6.2.0 WASM (MusicXML → SVG) + @resvg/resvg-js 2.6.2 (SVG → PNG). `runId`는 입력 해시(FNV-1a)로 결정적.
- `src/pptx/builder.ts` — `PptxGenJsBuilder implements PptxBuilder`. pptxgenjs 4.0.1. PNG를 안전여백 박스 contain-fit으로 배치(요소 잘림 0). 16:9 (13.333 × 7.5 in).
- `src/pptx/ooxml.ts` — `validatePptxOoxml`. jszip + fast-xml-parser로 ZIP / Content_Types / presentation.xml / rels / slides / slideMaster / slideLayout / media / well-formed / relationship-target-resolve / each-slide-has-image 검사.

**packages/pipeline (`@worship-score/pipeline`) — Milestone 1 러너.**

- `src/m1.ts` — 체인 실행 + 산출물 기록.
- `src/fixtures/cleanDigitalSample.ts` — 권리가 명확한 합성 찬양 멜로디 fixture: C major, 4/4, 8마디, 2절(verse + chorus), chorus repeat, tie 1개.

### DB 변경

없음. M1은 DB를 도입하지 않는다(원칙 ADR-000).

### API

없음. 웹 API는 M2 이후에 도입한다. M1은 `pnpm m1` CLI 러너로만 실행된다.

### UI

없음. UI는 M6 이후에 도입한다.

### worker

없음. M1은 단일 프로세스 결정적 체인 러너다. 큐/워커 분리는 M2 이후.

### 테스트

- vitest 전체 통과(`pnpm test`): core 21 + pipeline fixture 5 + e2e 1(render → pptx → ooxml).
- `tsc -p tsconfig.json` 타입체크 clean.

### 수용 기준 (실제 실행/검증 결과)

`pnpm m1` 실행 결과는 다음과 같다.

- 스키마(zod) 통과.
- 검증 결과 blocking 0 / warning 0.
- MusicXML 11806 bytes (결정적 확인).
- 슬라이드 4장.
- Verovio 6.2.0 정상.
- PNG 4장 (2400 × 314 px, 결정적).
- PPTX `out/worship-score-sample.pptx` (213,481 bytes, 4슬라이드).

OOXML 검증 13개 항목 전부 통과:

```text
zip_loadable
content_types_present
root_rels_present
presentation_xml_present
presentation_rels_present
slides_present
slide_count_match
slide_master_present
slide_layout_present
media_present
all_xml_well_formed
relationship_targets_resolve
each_slide_has_image
```

산출물 시각 확인: 슬라이드 PNG에 높은음자리표, 4/4 박자표, 멜로디 음표, 마디선, 한글 가사가 정확히 렌더됨(악보형 PPT 실증).

PRD §8 M1 완료 조건 대비:

- 고정 샘플 악보가 실제 PPTX로 생성됨 → 충족.
- SVG와 PNG 모드 → 충족 (`out/assets/slide-XX.svg`, `slide-XX.png`).
- 코드 숨김 / 요소 잘림 없음 → 충족 (contain-fit 배치, 잘림 0).
- 동일 입력의 결정적 결과 → ScoreIR→MusicXML, ScoreIR→SVG/PNG는 동일 머신에서 결정적으로 검증됨.
- 테스트 통과 → 충족.
- PowerPoint 호환 검증 절차 마련 → **부분 충족 (잔여 항목으로 추적, 아래 위험 참조)**.

### 위험 (정직하게 기재된 한계)

- (a) **PPTX 바이트 단위 결정성 미보장.** pptxgenjs가 생성 타임스탬프를 삽입한다. 추후 정규화 필요.
- (b) **엄격한 W3C MusicXML XSD 검증 미구현.** 현재는 구조 검증 + Verovio 라운드트립(로드 성공)으로 대체. XSD 번들 도입은 추후.
- (c) **PowerPoint '수리 경고 없이 열기' 라이브 테스트 미실행.** 머신에 Office 없음. 수동/CI 절차로 추적.
- (d) **가사 텍스트의 크로스-머신 폰트 결정성 미보장.** resvg가 시스템 폰트를 사용. 폰트 임베드/고정은 추후.

### 롤백

M1은 신규 인프라 의존성(DB/API/큐)을 만들지 않는 자기완결적 라이브러리 + CLI 러너다. 롤백은 해당 커밋 revert만으로 가능하며, 외부 상태(데이터/스키마)에 부수효과가 없다.

---

## Milestone 2 — 업로드와 작업 파이프라인 (계획)

### 목표

사용자가 악보 파일을 업로드하고, 권리 확인·MIME 검사·객체 저장·입력 품질 점검을 거쳐, idempotency와 retry를 갖춘 job state machine으로 처리 작업을 추적할 수 있게 한다. 본 Milestone부터 PRD §6 권장 스택(Next.js 16, PostgreSQL, S3 호환 객체 저장소, Redis 또는 관리형 큐)을 도입한다.

### 변경 파일 (예상)

- `apps/web/**` (신규, Next.js 16 App Router) — 업로드 엔드포인트 및 진행/실패 UI.
- `packages/core/src/types/providers.ts` (확장) — ObjectStorageProvider, JobQueueProvider 계약은 이미 선언되어 있으므로 구현 입력/결과 타입 보강.
- `packages/core/src/jobs/**` (신규) — Domain의 job state machine(상태 전이 규칙, idempotency key 규약).
- `packages/adapters/src/storage/**` (신규) — S3 호환 ObjectStorageProvider 구현.
- `packages/adapters/src/queue/**` (신규) — Redis 또는 관리형 큐 JobQueueProvider 구현.
- `packages/adapters/src/upload/**` (신규) — MIME 검사, 입력 품질 점검.

### DB 변경

- `jobs` 테이블 (id, status, idempotency_key, attempts, created_at, updated_at, error).
- `uploads` 테이블 (id, object_key, mime, byte_size, rights_attestation, checksum).
- SQL migration 도입 (No ORM 원칙). 마이그레이션 파일 위치: `db/migrations/**` (예상).

### API

- `POST /api/v1/uploads` — 업로드 시작/권리 확인 attestation.
- `POST /api/v1/jobs` — job 생성 (idempotency key 기반).
- `GET /api/v1/jobs/:id` — 진행 상태 조회.

(엔드포인트 경로는 예상이며 구현 시 확정.)

### UI

- 업로드 폼 + 권리 확인 체크.
- 진행 표시(progress).
- 실패 UI(failure UI, 재시도 트리거).

### worker

- Node 기반 작업 소비자: 큐에서 job을 꺼내 state machine을 전이. retry/backoff, idempotent 처리. (이 단계에서는 OMR을 호출하지 않고 M1 체인 또는 고정 입력에 연결 가능.)

### 테스트

- job state machine 전이 단위 테스트.
- idempotency(중복 제출 무효화) 테스트.
- MIME/입력 품질 거부 케이스 테스트.
- 업로드→job 생성→상태 조회 통합 테스트.

### 수용 기준

- 동일 idempotency key 재제출 시 중복 job이 생성되지 않는다.
- 허용되지 않은 MIME/품질 미달 입력이 거부된다.
- 실패한 job이 정책에 따라 retry되고 최종 실패 시 failure UI에 노출된다.
- 객체 저장소에 업로드 원본이 저장되고 checksum이 일치한다.

### 위험

- 큐/저장소 선택(Redis vs 관리형, S3 vs 호환 구현)에 따른 운영 비용·복잡도. TBD(추후 측정).
- idempotency key 설계 결함 시 중복 처리 또는 작업 유실 가능성.
- Domain이 S3 SDK/Redis client를 직접 import하지 않도록 어댑터 경계 준수 필요(레이어 위반 회귀 위험).

### 롤백

- migration은 down 스크립트로 되돌린다.
- 신규 `apps/web`, 어댑터, job 모듈은 기능 플래그 또는 커밋 revert로 비활성화. M1 CLI 체인은 영향받지 않는다.

---

## Milestone 3 — OMR 기술 검증 (계획)

### 목표

OMR 엔진을 즉시 프로덕션에 확정하지 않고, provider interface 뒤에서 후보 엔진을 spike하여 품질·비용·처리시간·라이선스·실패 유형을 권리가 명확한 골든셋으로 측정한다. 벤치마크 결과는 `/docs/worship-score/OMR_BENCHMARK.md`에 기록한다.

### 변경 파일 (예상)

- `packages/core/src/types/providers.ts` — OMRProvider 계약은 이미 선언됨. 후보·신뢰도·실패 유형 타입 보강.
- `packages/adapters/src/omr/mock/**` (신규) — mock provider.
- `packages/adapters/src/omr/<candidate>/**` (신규, spike) — 후보 엔진 어댑터.
- `tools/omr-benchmark/**` (신규) — 골든셋 실행/측정 스크립트.
- `docs/worship-score/OMR_BENCHMARK.md` (신규) — 측정 결과.

### DB 변경

- 벤치마크 단계에서는 영속화 불필요. 측정 결과는 문서/아티팩트로 보관. (필요 시 측정 메타데이터 테이블은 TBD.)

### API

- 핵심 경로 API 없음. 벤치마크는 오프라인/도구로 실행.

### UI

- 없음 (벤치마크 단계).

### worker

- 컨테이너 또는 Python 기반 OMR worker는 spike에 한해 격리 실행. 현 머신에 Java 없음 → Audiveris/MuseScore CLI 직접 실행 불가, 컨테이너화 또는 대체 후보로 검증 TBD(추후 측정).

### 테스트

- mock provider 계약 적합성 테스트.
- 골든셋 회귀(품질 지표 임계 통과) 테스트.

### 수용 기준

- 최소 1개 mock + 1개 이상 후보 엔진이 provider interface를 통해 동작.
- 골든셋에 대해 품질/비용/처리시간/실패 유형이 OMR_BENCHMARK.md에 정량 기록됨(수치 TBD, 추후 측정).
- 벤치마크 없이 특정 엔진을 핵심 경로에 고정하지 않는다.

### 위험

- **Audiveris는 AGPL-3.0.** 현재 의존성에 추가하지 않으며, 법무 승인 전 프로덕션 경로 금지. 별도 worker 분리만으로 AGPL 의무가 자동 해소된다고 가정하지 않는다(법무 검토 게이트).
- 후보 엔진 품질이 목표 미달일 경우 핵심 경로 재설계 필요.
- 비용/처리시간은 현 시점 미측정 TBD(추후 측정).

### 롤백

- spike 어댑터는 핵심 경로에 연결하지 않으므로 제거가 안전. provider interface 뒤에 격리되어 다른 Milestone에 영향 없음.

---

## Milestone 4 — ScoreIR과 구조 검증 강화 (계획)

### 목표

버전형 ScoreIR 스키마(`scoreir-0.1.0` 기반)에 원본 좌표·후보·신뢰도·음악 규칙을 충실히 반영하고, MusicXML 변환을 property test로 강화하며, immutable revision 모델로 영속화한다.

### 변경 파일 (예상)

- `packages/core/src/types/scoreir.ts` — 이미 SourceRegion / EvidenceSource / ScoreUncertainty / MusicalContext 보유. 후보·신뢰도 표현 보강.
- `packages/core/src/validation/index.ts` — 현재 12개 규칙. 음악 규칙 확장.
- `packages/core/src/musicxml/**` — 변환 결정성 property test 추가.
- `packages/core/src/revision/**` (신규) — immutable revision 규칙(Domain).
- `packages/adapters/src/persistence/**` (신규) — ScoreIR/리비전 영속화 어댑터.

### DB 변경

- `scores` / `score_revisions` 테이블 (immutable revision, content hash, schema_version).
- SQL migration 추가.

### API

- `POST /api/v1/scores`, `GET /api/v1/scores/:id/revisions/:rev` (예상).

### UI

- 없음 (검수 UI는 M6).

### worker

- 없음 또는 변환 워커 보강 (예상).

### 테스트

- ScoreIR ↔ MusicXML 라운드트립/직렬화 property test.
- revision 불변성(기존 리비전 변경 불가) 테스트.
- 음악 규칙 검증 케이스 확장.

### 수용 기준

- 모든 ScoreIR이 버전형 스키마로 검증되고, 리비전은 immutable.
- 동일 입력 MusicXML 직렬화가 결정적임을 property test로 보장.
- 원본 좌표·후보·신뢰도가 스키마에 표현되고 검증된다.

### 위험

- 스키마 버전 마이그레이션(`scoreir-0.1.0` → 차기) 호환성 관리.
- property test가 결정성 가정을 깨는 엣지(예: tie/repeat 경계)를 노출할 수 있음.

### 롤백

- migration down + 커밋 revert. 기존 리비전은 immutable이므로 데이터 손상 위험 낮음.

---

## Milestone 5 — 런타임 AI 검증 (계획)

### 목표

model provider abstraction 뒤에서 tool contracts와 structured output을 사용해, 필요한 크롭만 분석하여 patch proposal을 생성하고 validation-aware 결정을 내린다. token/cost를 로깅하고 prompt injection을 방어한다.

### 변경 파일 (예상)

- `packages/core/src/types/providers.ts` — VisionReviewProvider 계약 보유. tool contract/structured output 타입 보강.
- `packages/adapters/src/vision/**` (신규) — model provider 구현(Domain은 Claude SDK 등을 직접 import하지 않음).
- `packages/core/src/review/**` (신규) — validation-aware patch 의사결정 로직(Domain).

### DB 변경

- `ai_reviews` / `token_usage` 테이블 (cost/usage 로깅).

### API

- `POST /api/v1/scores/:id/ai-review` (예상).

### UI

- 없음 (검수 UI는 M6에서 통합).

### worker

- AI 검증 워커(크롭 추출 → model 호출 → patch proposal). 비동기 job으로 처리.

### 테스트

- structured output 스키마 적합성 테스트.
- prompt injection 방어(악성 입력 무력화) 테스트.
- validation-aware 결정 로직 단위 테스트.

### 수용 기준

- 모델 출력이 structured output 계약을 위반하면 거부된다.
- 필요한 크롭만 분석되고 token/cost가 로깅된다.
- prompt injection 시도가 차단된다.

### 위험

- 모델 비용/지연 TBD(추후 측정).
- prompt injection 방어의 완전성 한계.
- Domain이 model SDK를 직접 import하지 않도록 경계 준수.

### 롤백

- AI 검증은 어드바이저리(patch proposal) 단계로 격리. 비활성화해도 결정적 체인은 동작. 커밋 revert + 기능 플래그.

---

## Milestone 6 — 검수 UI (3열) (계획)

### 목표

원본·재렌더링·문제 목록의 3열 검수 UI를 제공하고, 음높이·음가·가사 수정과 undo/redo, revision, 승인, 충돌 처리를 지원한다.

### 변경 파일 (예상)

- `apps/web/app/review/**` (신규, Next.js 16 + Chakra UI 3) — 3열 검수 화면.
- `packages/core/src/review/**` — undo/redo, 충돌 처리 도메인 로직.

### DB 변경

- revision/승인 상태 컬럼 및 충돌 해결 메타데이터 (M4 `score_revisions` 확장).

### API

- `PATCH /api/v1/scores/:id` (수정), `POST /api/v1/scores/:id/approve` (예상).

### UI

- 3열: 원본 / 재렌더링 / 문제 목록.
- 음높이·음가·가사 인라인 수정.
- undo/redo, 승인, 충돌 처리.

### worker

- 재렌더링 워커(수정 반영 후 Verovio 재렌더).

### 테스트

- undo/redo 일관성, 충돌 처리, 승인 전이 테스트.
- 수정→재렌더 통합 테스트.

### 수용 기준

- 사용자가 음높이/음가/가사를 수정하면 즉시 재렌더링이 반영된다.
- 동시 수정 충돌이 안전하게 해소되고 승인본 리비전이 생성된다.

### 위험

- 동시 편집 충돌 모델의 복잡도.
- 재렌더 지연이 검수 UX에 미치는 영향 TBD(추후 측정).

### 롤백

- UI 라우트 비활성화 + 커밋 revert. 승인본 리비전은 immutable이므로 데이터 안전.

---

## Milestone 7 — 발표 구성과 PPT (계획)

### 목표

섹션·반복을 반영한 슬라이드 계획과 템플릿을 적용해 미리보기를 제공하고, PPT를 생성·검증·다운로드한다. M1에서 증명된 `planPresentation()` + PptxGenJsBuilder + OOXML 검증을 제품 경로로 승격한다.

### 변경 파일 (예상)

- `packages/core/src/presentation/**` — 이미 `planPresentation()` 보유. 템플릿/반복 처리 확장.
- `packages/adapters/src/pptx/**` — builder/ooxml 검증 보유. 템플릿 적용 보강.
- `apps/web/app/presentation/**` (신규) — 발표 구성/미리보기/다운로드 UI.

### DB 변경

- `presentations` / `templates` 테이블 (예상).

### API

- `POST /api/v1/presentations`, `GET /api/v1/presentations/:id/download` (예상).

### UI

- 섹션/반복 구성, 슬라이드 계획 미리보기, 템플릿 선택, 다운로드.

### worker

- PPT 생성 워커(Node 기반 PPTX worker, M1 어댑터 재사용).

### 테스트

- slide plan(섹션 경계 우선, 마디 미분할) 회귀 테스트.
- 생성 PPTX의 OOXML 13검사 통과 테스트(M1 e2e 확장).

### 수용 기준

- 섹션·반복이 슬라이드 계획에 정확히 반영된다.
- 생성된 PPTX가 OOXML 검증 13항목을 통과하고 다운로드된다.
- 요소 잘림 0(M1 contain-fit 보장 승계).

### 위험

- (M1 잔여) PPTX 바이트 결정성 미보장 — 정규화 필요.
- (M1 잔여) PowerPoint 라이브 '수리 경고 없이 열기' 검증 절차 필요.
- (M1 잔여) 가사 폰트 크로스-머신 결정성 — 폰트 임베드/고정 필요.

### 롤백

- 발표 라우트/워커 비활성화 + 커밋 revert. 핵심 변환 체인은 영향 없음.

---

## Milestone 8 — 조직 라이브러리와 통합 PPT (계획)

### 목표

조직·역할 기반으로 곡을 검색하고 승인본을 재사용하며, 중복을 탐지하고 예배 프로젝트 단위의 통합 PPT를 생성한다.

### 변경 파일 (예상)

- `apps/web/app/library/**`, `apps/web/app/projects/**` (신규).
- `packages/core/src/library/**` (신규) — 검색/중복 탐지/프로젝트 도메인.

### DB 변경

- `organizations` / `members` / `roles` / `worship_projects` / `project_items` 테이블 (예상).

### API

- `GET /api/v1/library/search`, `POST /api/v1/projects`, `POST /api/v1/projects/:id/compose` (예상).

### UI

- 곡 검색, 승인본 재사용, 중복 탐지 경고, 예배 프로젝트 편성, 통합 PPT.

### worker

- 통합 PPT 생성 워커(여러 승인본을 단일 PPTX로 합성).

### 테스트

- 권한(역할) 접근 제어 테스트.
- 중복 탐지 정확도 테스트.
- 통합 PPT OOXML 검증 테스트.

### 수용 기준

- 역할별 접근 제어가 강제된다.
- 승인본 재사용 및 중복 탐지가 동작한다.
- 예배 프로젝트가 단일 통합 PPTX로 생성되고 검증을 통과한다.

### 위험

- 멀티테넌시 데이터 격리 결함 위험.
- 중복 탐지 임계값 튜닝 TBD(추후 측정).

### 롤백

- 라이브러리/프로젝트 모듈 비활성화 + migration down + 커밋 revert.

---

## Milestone 9 — 상업화 (계획)

### 목표

사용량·과금·관리자·감사 로그·백업·지원 접근·저작권 신고·SBOM·라이선스 승인·장애 대응을 갖춰 상업 운영 가능 상태로 만든다.

### 변경 파일 (예상)

- `apps/web/app/admin/**`, `apps/web/app/billing/**` (신규).
- `packages/core/src/billing/**`, `packages/core/src/audit/**` (신규).
- `tools/sbom/**` (신규) — SBOM 생성.

### DB 변경

- `usage_events` / `invoices` / `audit_logs` / `copyright_reports` 테이블 (예상).

### API

- 과금/관리자/감사/저작권 신고 엔드포인트 (예상).

### UI

- 사용량 대시보드, 과금, 관리자, 지원 접근, 저작권 신고.

### worker

- 사용량 집계, 백업, 청구 워커.

### 테스트

- 과금 계산 정확도, 감사 로그 불변성, 백업/복구 리허설 테스트.

### 수용 기준

- 사용량이 정확히 집계·과금된다.
- 감사 로그가 불변으로 기록된다.
- 백업/복구 절차가 검증된다.
- SBOM이 생성되고 모든 제3자 라이선스가 승인 게이트를 통과한다(특히 Audiveris AGPL 게이트).

### 위험

- 과금 정확도/정산 분쟁.
- 저작권 신고 처리 SLA.
- 라이선스 승인 누락 시 상업 배포 차단(특히 AGPL 컴포넌트).

### 롤백

- 과금/관리자 모듈은 기능 플래그로 단계적 비활성화. migration down + 커밋 revert. 감사 로그는 보존.

---

## 부록 A — 제3자 라이선스 (확정 버전/SPDX)

| 패키지 | 버전 | SPDX / 선택 |
| --- | --- | --- |
| verovio | 6.2.0 | LGPL-3.0-or-later |
| @resvg/resvg-js | 2.6.2 | MPL-2.0 |
| pptxgenjs | 4.0.1 | MIT |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) → **MIT 선택** |
| fast-xml-parser | 5.8.0 | MIT |
| zod | 3.25.76 | MIT |
| tsx | 4.22.4 | MIT |
| vitest | 2.1.9 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| Audiveris | — | **AGPL-3.0** (현재 의존성 미추가, 법무 승인 전 프로덕션 경로 금지) |

> Audiveris는 현재 의존성에 추가하지 않는다. 별도 worker 분리만으로 AGPL 의무가 자동 해소된다고 가정하지 않으며, M3 spike 및 M9 라이선스 승인 게이트에서 법무 검토를 거친다.

## 부록 B — M1 잔여 추적 항목

| ID | 항목 | 상태 | 대응 Milestone |
| --- | --- | --- | --- |
| R-a | PPTX 바이트 단위 결정성 정규화 (pptxgenjs 타임스탬프) | 미완 | M1 잔여 / M7 |
| R-b | MusicXML W3C XSD 엄격 검증 (현재 구조 검증 + Verovio 라운드트립 대체) | 미완 | M1 잔여 / M4 |
| R-c | PowerPoint '수리 경고 없이 열기' 라이브 검증 절차 (Office 부재) | 미완 | M1 잔여 / M7 (CI·수동) |
| R-d | 가사 폰트 크로스-머신 결정성 (resvg 시스템 폰트 → 임베드/고정) | 미완 | M1 잔여 / M7 |
