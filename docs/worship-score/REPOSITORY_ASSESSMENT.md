# REPOSITORY_ASSESSMENT.md

> WorshipScore AI — 저장소 현황 및 구현 기준선 평가
> PRD 구현프롬프트 §7.1 산출물. 본 문서는 Milestone 1 종료 시점의 저장소 상태를 평가하고, 이후 Milestone 구현이 의존할 기준선과 그 근거를 기술한다.

## 0. 요약 (Executive Summary)

본 저장소는 **그린필드(greenfield)** 프로젝트다. 평가 시작 시점에 원격(`github.com/maesil-9/CCM-to-PPT`)은 비어 있었고, 로컬에는 PRD 문서 1개만 존재했다. 따라서 **"보존(preserve)해야 할 기존 코드는 없다."** 본 문서가 다루는 "재사용 가능한 요소"·"유지할 패턴"·"교체가 필요한 부분"은 모두 *Milestone 1에서 새로 채택·구현한 기준선*에 대한 평가이며, 레거시 코드에 대한 평가가 아니다.

Milestone 1의 목적은 빅뱅 도입을 피하고 핵심 결정적 변환 체인(ScoreIR → MusicXML → 렌더 → PPTX → 검증)을 먼저 실증하는 것이었으며, 이 체인은 실제로 실행·검증되었다(`pnpm m1`, vitest 전체 통과(`pnpm test`), OOXML 13개 항목 통과). 산출물은 가사 자막형 PPT가 아니라 **오선·음표·마디선·가사가 조판된 악보형 16:9 PPTX**임이 시각적으로 확인되었다.

---

## 1. 현재 아키텍처 (그린필드 사실 명시)

### 1.1 그린필드 상태 확인

- 원격 저장소: 빈 상태였음. git 연결 완료(`origin`, 기본 브랜치 `main`).
- 로컬: PRD 1개 파일만 존재했음.
- 결론: **마이그레이션 대상 코드 없음. 모든 코드는 Milestone 1에서 신규 작성됨.**

### 1.2 채택한 아키텍처 기준선

빅뱅 금지 원칙(ADR-000 근거)에 따라, Milestone 1에서는 웹 프레임워크·DB·UI를 **의도적으로 도입하지 않고** 핵심 결정적 체인만 먼저 구현했다. Next.js / PostgreSQL / Chakra 등 PRD 권장 스택은 Milestone 2 이후 도입 예정이다.

레이어 경계는 다음과 같이 단방향으로 정의되었다.

```
UI → Application Use Cases → Domain → Provider Interfaces → Infrastructure Adapters
```

- **Domain은 외부 엔진/SDK를 직접 import하지 않는다.** (Verovio, PptxGenJS 등은 Domain에서 보이지 않음.)
- 외부 엔진 의존은 Infrastructure Adapter 계층에서만 발생하며, Domain은 `src/types/providers.ts`의 provider 인터페이스를 통해서만 외부와 통신한다.

### 1.3 모노레포 / 툴체인

- 패키지 매니저: pnpm 워크스페이스 모노레포 (pnpm 11.5.2).
- 언어: TypeScript strict (NodeNext ESM, `noUncheckedIndexedAccess` 등).
- 런타임 실행: tsx. 테스트: vitest. 스키마 검증: zod.
- 런타임 환경: Windows 11 Pro, Node v22.21.0, Python 3.12.10.

### 1.4 패키지 구성 (실제 존재)

| 패키지 | 이름 | 계층 | 외부 엔진 import |
|---|---|---|---|
| `packages/core` | `@worship-score/core` | Domain | 없음 |
| `packages/adapters` | `@worship-score/adapters` | Infrastructure | 있음(Verovio, resvg, pptxgenjs, jszip, fast-xml-parser) |
| `packages/pipeline` | `@worship-score/pipeline` | 재사용 빌드 엔진(`buildPresentation`) + Milestone 1 러너 | (adapters 경유) |
| `packages/cli` | `@worship-score/cli` | 폴더-드롭 CLI (`pnpm ws`) | (pipeline 경유) |
| `apps/web` | `@worship-score/web` | 출력 스타일 에디터 HTTP 서버 (`pnpm web`, ADR-011) | (pipeline 경유) |

> M1 이후 추가됨: CLI(폴더 워크플로)·웹(스타일 에디터, 라이브 미리보기 + PPTX 내보내기). 코드/키/
> 배경/잉크색/선두께/레이아웃/타이포 옵션, 옵션 영속화, 배경 업로드가 `buildPresentation` 위에 구현됨.

**`@worship-score/core` (Domain) 주요 모듈**

- `src/types/scoreir.ts` — ScoreIR 타입 정의. `SCOREIR_SCHEMA_VERSION = 'scoreir-0.1.0'`. (Pitch/Duration/Key/Time/Clef/Lyric/Note/Rest/Measure/ScoreSection/PresentationItem/SourceRegion/EvidenceSource/ScoreUncertainty/MusicalContext/ScorePart/ScoreIR)
- `src/types/validation.ts` — `ScoreValidationIssue`(severity: info|warning|error|fatal), `ScoreValidationResult`.
- `src/types/presentation.ts` — `PresentationProfile`, `SlidePlan`, `SlidePlanSlide`.
- `src/types/providers.ts` — provider 인터페이스: `RendererProvider`, `PptxBuilder`, `VisionReviewProvider`, `OMRProvider`, `ObjectStorageProvider`, `JobQueueProvider` (+ `RenderScoreInput/Result`, `GeneratePptxInput`, `PptxValidationResult` 등).
- `src/duration.ts` — `eventDurationDivisions` / `measureDurationDivisions`, `DEFAULT_DIVISIONS = 8`(divisions per quarter).
- `src/context.ts` — `computeActiveAttributes`(마디별 활성 key/time/clef/divisions).
- `src/validation/index.ts` — `validateScore()`, 12개 규칙 구현.
- `src/musicxml/{xml.ts,serialize.ts}` — 결정적 ScoreIR → MusicXML 4.0 `score-partwise` 직렬화(마디 부분집합/절 필터 지원, 부분집합 첫 마디에 full attributes 재기재).
- `src/presentation/{profile.ts,slidePlan.ts}` — `DEFAULT_PRESENTATION_PROFILE`(profile-0.1.0), `planPresentation()`(섹션 경계 우선 분할, 마디 미분할, `perSlide = measuresPerSystem * maxSystemsPerSlide`).
- `src/schema/scoreir.schema.ts` — zod 스키마 + `parseScoreIr` / `safeParseScoreIr`.

**`@worship-score/adapters` (Infrastructure) 주요 모듈**

- `src/verovio/renderer.ts` — `VerovioRenderer implements RendererProvider`. verovio 6.2.0 WASM(MusicXML→SVG) + `@resvg/resvg-js` 2.6.2(SVG→PNG). `runId`는 입력 해시(FNV-1a)로 결정적.
- `src/pptx/builder.ts` — `PptxGenJsBuilder implements PptxBuilder`. pptxgenjs 4.0.1. PNG를 안전여백 박스 contain-fit으로 배치(요소 잘림 0). 16:9(13.333 × 7.5 in).
- `src/pptx/ooxml.ts` — `validatePptxOoxml`. jszip + fast-xml-parser로 ZIP / Content_Types / presentation.xml / rels / slides / slideMaster / slideLayout / media / well-formed / relationship-target-resolve / each-slide-has-image 검사.

**`@worship-score/pipeline` (Milestone 1 러너)**

- `src/m1.ts` — 체인 실행 + 산출물 기록.
- `src/fixtures/cleanDigitalSample.ts` — 권리 명확한 합성 찬양 멜로디 fixture(C major, 4/4, 8마디, 2절, verse+chorus, chorus repeat, tie 1개).

### 1.5 검증된 실행 결과 (Milestone 1)

체인: `ScoreIR → zod schema → validateScore → MusicXML 4.0 → Verovio(SVG+PNG) → slide plan → PptxGenJS PPTX → OOXML 검증 → preview(PNG)`.

`pnpm m1` 실행 결과(확정):

- 스키마 통과. 검증 blocking 0 / warning 0.
- MusicXML 11,806 bytes (결정적 확인).
- 슬라이드 4장. Verovio 6.2.0 정상.
- PNG 4장 (2400 × 314 px, 결정적).
- PPTX `out/worship-score-sample.pptx` (213,481 bytes, 4슬라이드).
- OOXML 검증 13개 항목 전부 통과: `zip_loadable`, `content_types_present`, `root_rels_present`, `presentation_xml_present`, `presentation_rels_present`, `slides_present`, `slide_count_match`, `slide_master_present`, `slide_layout_present`, `media_present`, `all_xml_well_formed`, `relationship_targets_resolve`, `each_slide_has_image`.
- 시각 확인: 슬라이드 PNG에 높은음자리표·4/4·멜로디 음표·마디선·한글 가사가 정확히 렌더됨(악보형 PPT 실증).
- 테스트: vitest 전체 통과(`pnpm test`). `tsc -p tsconfig.json` 타입체크 clean.

---

## 2. 재사용 가능한 요소

그린필드이므로 "기존 코드 재사용"이 아니라, **이후 Milestone이 그대로 의존·확장할 수 있는 Milestone 1 자산**을 의미한다.

| 요소 | 재사용 범위 | 비고 |
|---|---|---|
| ScoreIR 타입 + zod 스키마 (`scoreir-0.1.0`) | 전 Milestone의 중심 데이터 모델 | OMR(M3)·영속화(M4)·검수 UI(M6)·발표구성(M7)이 이 IR을 공유 |
| Provider 인터페이스 (`src/types/providers.ts`) | M3 OMR, M5 AI 검증, M2 storage/queue | `OMRProvider`·`VisionReviewProvider`·`ObjectStorageProvider`·`JobQueueProvider`는 이미 인터페이스만 정의됨(미구현) → 어댑터 추가만으로 연결 |
| `validateScore()` 12개 규칙 | M4 property test 강화의 토대 | severity 모델(info/warning/error/fatal)이 이미 존재 |
| 결정적 MusicXML 직렬화 | OMR 후보 엔진 비교·골든셋 기준 출력 | 부분집합/절 필터 지원이 발표구성(M7)에 직접 재사용 |
| `planPresentation()` 슬라이드 분할 | M7 발표구성·템플릿 | 섹션 경계 우선 / 마디 미분할 정책 보존 가치 높음 |
| OOXML 구조 검증기 (`validatePptxOoxml`) | M9 상업화 CI 게이트 | 13개 항목 회귀 방지 체크로 재사용 |
| 권리 명확한 합성 fixture | 전 Milestone 테스트/골든셋 시드 | 저작권 리스크 없는 결정적 입력 |
| pnpm 모노레포 + strict TS + vitest 툴체인 | 전 패키지 공통 기반 | 신규 패키지(`apps/web` 등) 추가만으로 확장 |

---

## 3. 요구사항 대비 갭 (PRD 대비)

Milestone 1은 PRD의 핵심 변환 체인만 증명했고, 나머지는 미구현 범위로 확정되어 있다.

| 영역 | 현재 상태 | 해당 Milestone |
|---|---|---|
| 업로드/작업 파이프라인 | 없음 | M2 (파일 업로드·권리확인·MIME검사·객체저장·입력품질·job state machine·idempotency·retry) |
| OMR (이미지/PDF → ScoreIR) | provider 인터페이스만 존재, 엔진 미연결 | M3 (mock·후보 엔진 spike·골든셋·품질/비용/시간 측정, Audiveris AGPL 게이트) |
| ScoreIR 영속화 / immutable revision | 없음(인메모리 변환만) | M4 (영속화·revision·property test 강화) |
| 런타임 AI 검증 | `VisionReviewProvider` 인터페이스만 존재 | M5 (model provider·tool contracts·structured output·prompt injection 방어) |
| 검수 UI(3열) | 없음 | M6 |
| 발표구성/템플릿/PPT 고도화 | 단일 기본 프로파일만 | M7 |
| 조직 라이브러리 / 통합 PPT | 없음 | M8 |
| 상업화(과금/감사로그/백업/SBOM/라이선스 승인) | 없음 | M9 |
| 웹 프레임워크 / DB / 인증 / UI | 없음(의도적 미도입) | M2+ |

---

## 4. 기술 부채

Milestone 1은 의도적으로 범위를 좁혔으므로, 아래는 *알려진(known) 부채*이며 정직하게 추적된다.

1. **PPTX 바이트 단위 결정성 미보장.** pptxgenjs 4.0.1이 생성 타임스탬프를 삽입하여 동일 입력에도 바이트가 달라질 수 있음 → 정규화(타임스탬프 고정/스트립) 필요. (MusicXML·SVG·PNG는 결정적임이 확인됨.)
2. **W3C MusicXML XSD 검증 미구현.** 현재는 구조 검증 + Verovio 라운드트립(로드 성공)으로 대체. XSD 번들 도입은 추후.
3. **PowerPoint 라이브 호환성 미실증.** 실제 PowerPoint "수리 경고 없이 열기" 테스트는 미실행(머신에 Office 없음). 수동/CI 절차로 추적 필요.
4. **가사 텍스트 크로스-머신 폰트 결정성 미보장.** resvg가 시스템 폰트를 사용하므로 머신 간 글리프 차이 가능 → 폰트 임베드/고정 필요.
5. **provider 인터페이스의 미구현 슬롯.** `OMRProvider`, `VisionReviewProvider`, `ObjectStorageProvider`, `JobQueueProvider`는 계약만 존재하고 구현체가 없음(설계상 정상이나, 미연결 상태임을 인지해야 함).

부채 규모/측정값(예: 정규화 후 결정성 재현율, XSD 위반 건수)은 현재 **TBD(추후 측정)**.

---

## 5. 보안 위험 (현 단계 한정)

현 단계는 **업로드·DB·인증·네트워크 노출 경로가 존재하지 않는** 로컬 결정적 파이프라인이므로, 일반적인 웹 공격면(인증 우회·SQLi·SSRF 등)은 **현재 적용 대상이 아니다.** 다만 다음을 명시한다.

- **신뢰 경계 부재가 곧 안전을 의미하지 않음.** 입력 fixture는 내부 합성 데이터이며, 외부 사용자 입력 처리 경로(파일 업로드·MIME 검사·권리 확인)는 M2에서 신규로 들어온다. 그 시점에 위협 모델을 재작성해야 한다.
- **외부 의존성 공급망.** Verovio WASM·resvg 네이티브 바이너리 등 네이티브/WASM 의존이 존재. 버전 고정은 되어 있으나 SBOM·서명 검증은 M9 범위(현재 미구현).
- **AGPL 라이선스 게이트.** Audiveris(AGPL-3.0)는 현재 의존성에 포함되지 않음. M3 OMR 도입 시 법무 승인 전 프로덕션 경로 금지. **별도 worker 분리만으로 AGPL 의무가 자동 해소된다고 가정하지 않는다.**
- **prompt injection.** 런타임 AI 검증(M5)에서 비로소 등장하는 위험. 현 단계에는 LLM 호출 경로가 없으므로 비적용.

현 단계 잔여 보안 위험 평가: **낮음(공격면 없음).** 단, 이는 *기능 부재에 기인한 일시적 상태*이며 M2 진입 시 즉시 재평가 대상이다.

---

## 6. 배포 제약

- **현 단계 배포 대상 없음.** Milestone 1은 로컬 CLI 러너(`pnpm m1`)이며, 서버·DB·웹 배포 산출물이 없다.
- **런타임 전제:** Node v22.21.0, pnpm 11.5.2 환경. tsx 실행, vitest 테스트.
- **Java 부재 제약.** 현 머신에 Java가 없어 Audiveris / MuseScore CLI 사용 불가. 현 단계와는 무관(OMR은 M3)이나, M3 spike 환경 구성 시 JRE/JDK 프로비저닝이 선결 과제다.
- **Office 부재 제약.** 머신에 PowerPoint가 없어 라이브 열기 검증 불가 → CI 또는 Office 보유 환경에서의 수동 검증 절차로 보완 필요.
- **네이티브/WASM 의존.** `@resvg/resvg-js`(네이티브), verovio WASM은 배포 타깃 아키텍처별 빌드/번들 검증이 향후 필요(현재 Windows에서만 검증). 크로스플랫폼 재현성은 **TBD(추후 측정)**.
- **결정성 한계가 배포 캐싱에 미치는 영향.** PPTX 바이트 비결정성(§4-1)으로 인해, 콘텐츠 해시 기반 캐시/중복 제거를 현 시점에 PPTX에 적용하면 오작동할 수 있음 → 정규화 선행 필요.

---

## 7. 예상 변경 영역

| Milestone | 주된 변경/신규 영역 | 기존 자산에 대한 영향 |
|---|---|---|
| M2 | 신규 web/api 패키지, storage/queue 어댑터, job state machine | 기존 core/adapters는 인터페이스 경유로 호출만 추가, 내부 변경 최소 |
| M3 | `OMRProvider` 구현 어댑터(들), 골든셋, 측정 하네스 | ScoreIR 출력 계약이 OMR 입력 정합성의 기준이 됨 |
| M4 | ScoreIR 영속화 스키마, revision 모델, property test | `scoreir-0.1.0` 스키마 버저닝 정책 확정 필요 |
| M5 | `VisionReviewProvider` 구현, prompt injection 방어 | Domain 계약 불변, 어댑터 추가 |
| M6 | 검수 UI(3열) — 신규 프론트엔드 | `ScoreUncertainty`·`EvidenceSource`·`SourceRegion` 타입이 UI 데이터 소스 |
| M7 | 발표 프로파일 확장, 템플릿 엔진 | `planPresentation()`·`PresentationProfile` 확장(교체 아님) |
| M8 | 조직 라이브러리, 통합 PPT 조립 | 기존 PPTX 빌더 재사용 + 멀티 스코어 조립 계층 신규 |
| M9 | 과금·감사로그·백업·SBOM·라이선스 승인 | 횡단 관심사 신규, 기존 검증기(`validatePptxOoxml`)를 CI 게이트로 승격 |

가장 큰 변경 압력이 예상되는 지점: **(1) ScoreIR 스키마 버저닝/마이그레이션 정책(M4)**, **(2) PPTX 정규화 도입(M7 이전 권장)**, **(3) 네이티브/WASM 의존의 크로스플랫폼 배포(M2 인프라 진입 시)**.

---

## 8. 유지할 기존 패턴 (Milestone 1에서 확립)

다음 패턴은 검증되었고, 이후 Milestone에서 **보존**한다.

1. **단방향 레이어 경계.** `UI → Use Cases → Domain → Provider Interfaces → Infrastructure`. Domain의 외부 엔진 import 금지 규칙은 불변 원칙으로 유지.
2. **Provider 추상화.** 모든 외부 엔진(렌더러·PPTX 빌더·OMR·AI 검증·스토리지·큐)은 `src/types/providers.ts` 인터페이스 뒤에 둔다. 엔진 교체가 Domain 변경 없이 어댑터 교체로 끝나야 한다.
3. **결정성 우선.** 변환 경로는 결정적이어야 하며, 비결정 요소(타임스탬프·시스템 폰트)는 명시적으로 정규화·고정한다.
4. **스키마 버전 명시 + zod 검증.** `SCOREIR_SCHEMA_VERSION`·`profile-0.1.0` 등 버전 식별자와 런타임 파싱 검증을 유지.
5. **구조 검증 게이트.** 산출물(PPTX)은 머신 검사 가능한 검증기(`validatePptxOoxml`)를 통과해야 한다 — CI 게이트로 승격 예정.
6. **권리 명확한 합성 fixture 우선.** 저작권 리스크 없는 결정적 입력을 테스트/골든셋의 기본으로 유지.
7. **빅뱅 금지 / 증명 우선.** 프레임워크·DB·UI는 필요한 Milestone에서만 도입한다.

---

## 9. 교체가 필요한 부분

그린필드이므로 **레거시 교체는 없다.** 아래는 Milestone 1 기준선 중 *이후 단계에서 강화·정규화·확장이 필요한 항목*이다(완전 폐기가 아닌 보완).

| 대상 | 현재 | 필요한 조치 | 시점 |
|---|---|---|---|
| PPTX 생성 결정성 | pptxgenjs 타임스탬프로 바이트 비결정 | 출력 정규화(타임스탬프 고정/스트립) | M7 이전 권장 |
| MusicXML 검증 | 구조 검증 + Verovio 라운드트립 | W3C MusicXML XSD 번들 검증 추가 | 추후 |
| 폰트 렌더링 | resvg 시스템 폰트 | 폰트 임베드/고정으로 크로스머신 결정성 확보 | 추후 |
| PowerPoint 호환 검증 | 미실증(Office 없음) | CI/수동 라이브 열기 절차 | M9 또는 그 전 |
| Provider 미구현 슬롯 | 인터페이스만 존재 | 어댑터 구현 추가(교체 아님) | M2/M3/M5 |
| 단일 발표 프로파일 | `profile-0.1.0` 기본 1종 | 프로파일/템플릿 확장 | M7 |

**유지하되 교체하지 않을 것을 명확히 한다:** 레이어 경계·provider 추상화·ScoreIR 중심 데이터 모델·결정성 원칙은 교체 대상이 아니라 *확장의 토대*다.

---

## 10. 제3자 라이선스 현황 (확정)

| 패키지 | 버전 | 라이선스(SPDX) | 비고 |
|---|---|---|---|
| verovio | 6.2.0 | LGPL-3.0-or-later | WASM 렌더 |
| @resvg/resvg-js | 2.6.2 | MPL-2.0 | SVG→PNG |
| pptxgenjs | 4.0.1 | MIT | PPTX 생성 |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) → **MIT 선택** | OOXML 검사 |
| fast-xml-parser | 5.8.0 | MIT | XML 파싱 |
| zod | 3.25.76 | MIT | 스키마 |
| tsx | 4.22.4 | MIT | 실행 |
| vitest | 2.1.9 | MIT | 테스트 |
| typescript | 5.9.3 | Apache-2.0 | 타입체크 |
| Audiveris | — | **AGPL-3.0** | **현재 의존성 미포함.** 법무 승인 전 프로덕션 경로 금지. 별도 worker 분리로 AGPL 의무가 자동 해소된다고 가정하지 않음. |

SBOM·라이선스 승인 워크플로 자체는 M9 범위(현재 미구현).

---

## 11. 결론

본 저장소는 보존할 레거시가 없는 그린필드에서, **검증된 결정적 변환 체인**을 Milestone 1 기준선으로 확립했다. 이후 모든 Milestone은 이 기준선의 *교체가 아니라 확장*으로 진행되며, 핵심 보존 자산은 (1) ScoreIR 중심 데이터 모델, (2) 단방향 레이어 경계와 provider 추상화, (3) 결정성·구조 검증 게이트다. 알려진 부채(PPTX 바이트 결정성, XSD 검증, 폰트 고정, PowerPoint 라이브 호환)는 명시적으로 추적되며, 정량 측정값은 현 시점 **TBD(추후 측정)**로 둔다.
