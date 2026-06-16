# ADR-000: 모노레포 + core-first (웹 스택 보류)

- **Status**: Accepted
- **Date**: 2026-06-16
- **Deciders**: WorshipScore AI 구현 에이전트
- **Tags**: architecture, build-system, sequencing, milestone-1

---

## Context

WorshipScore AI는 찬양 악보 이미지/PDF를 구조화된 악보 데이터(ScoreIR)로 변환하고, 오선·멜로디·리듬·가사가 포함된 예배용 16:9 PPTX를 새로 조판·생성하는 상업용 SaaS다. 이는 가사 자막형 PPT가 아니라, 악보 자체를 새로 렌더링·조판해 슬라이드로 발행하는 제품이다.

본 결정 시점의 출발 조건은 다음과 같다.

- **그린필드**: 원격 저장소(`github.com/maesil-9/CCM-to-PPT`)는 비어 있었고, 로컬에는 PRD 1개 파일만 존재했다. git 연결은 완료되었다(`origin`, 브랜치 `main`).
- **실행 환경**: Windows 11 Pro, Node v22.21.0, pnpm 11.5.2, Python 3.12.10. Java는 설치되어 있지 않다.
- **PRD 권장 스택**: PRD는 Next.js, PostgreSQL, Chakra UI, 작업 큐, 객체 저장 등을 포함한 풀스택 SaaS 아키텍처를 권장한다.

핵심 긴장은 다음 질문에 있다. *제품의 본질적 위험(악보 → 구조화 데이터 → 악보형 PPT 변환 체인이 결정적으로, 그리고 정확하게 동작하는가)을 검증하기 전에, 풀스택 웹 인프라(웹 프레임워크·DB·UI·큐·객체저장)를 함께 구축할 것인가?*

그린필드에서 풀스택을 한 번에 세우는 접근(빅뱅)은, 아직 증명되지 않은 핵심 변환 체인의 불확실성과 인프라 구축 비용을 동시에 떠안는다. 제품의 차별적 가치와 가장 큰 기술 위험은 웹 계층이 아니라 **결정적 변환 체인**(ScoreIR → MusicXML → 악보 렌더 → PPTX)에 있다. 따라서 이 위험을 먼저, 최소 표면적으로 분리해 증명하는 것이 합리적이다.

## Decision

**"빅뱅 금지 / Milestone 1 우선 증명"** 원칙을 채택한다. 웹 프레임워크·DB·UI는 도입하지 않고, 핵심 결정적 변환 체인을 먼저 구현·검증한다. 구체적으로:

### 채택 (Milestone 1 범위)

- **빌드/패키지 구조**: pnpm 워크스페이스 기반 모노레포. 3개 패키지로 시작한다.
  - `packages/core` (`@worship-score/core`) — Domain. 외부 엔진/SDK를 직접 import하지 않는다(ScoreIR 타입, validation, MusicXML 직렬화, presentation profile/slide plan, zod 스키마).
  - `packages/adapters` (`@worship-score/adapters`) — Infrastructure. Verovio 렌더러, PptxGenJS 빌더, OOXML 검증.
  - `packages/pipeline` (`@worship-score/pipeline`) — Milestone 1 러너(`m1.ts`)와 권리 명확한 합성 fixture.
- **언어/컴파일**: TypeScript strict 모드(NodeNext ESM, `noUncheckedIndexedAccess` 등 엄격 옵션 포함).
- **런타임 실행**: `tsx`(번들/트랜스파일 단계 없이 TypeScript 직접 실행).
- **테스트**: `vitest`.
- **스키마/런타임 검증**: `zod`.
- **레이어 규칙**: UI → Application Use Cases → Domain → Provider Interfaces → Infrastructure Adapters. **Domain(`core`)은 외부 엔진/SDK를 직접 import하지 않는다.** 외부 의존(Verovio, PptxGenJS, jszip, resvg 등)은 모두 `adapters`에 격리하고, `core`는 `providers.ts`에 정의된 인터페이스(`RendererProvider`, `PptxBuilder`, `OMRProvider`, `ObjectStorageProvider`, `JobQueueProvider`, `VisionReviewProvider`)에만 의존한다.

### 보류 (Milestone 2+)

다음 항목은 **도입하지 않고** 이후 마일스톤으로 보류한다. PRD가 권장한 스택 선택 자체는 유지하며, 도입 시점만 늦춘다.

- Next.js(웹 프레임워크)
- PostgreSQL(DB)
- Chakra UI(UI 라이브러리)
- 작업 큐(job queue 구현체)
- 객체 저장(object storage 구현체)

`core`의 `providers.ts`는 이들 인프라에 대한 **provider 인터페이스를 미리 정의**해 두어, 이후 마일스톤에서 어댑터를 끼워 넣을 수 있는 봉합선(seam)을 확보한다.

## Consequences

### 긍정적 결과 (검증됨)

- **핵심 위험을 최소 표면적으로 먼저 증명**했다. Milestone 1 체인(ScoreIR → zod schema → `validateScore` → MusicXML 4.0 → Verovio SVG/PNG → slide plan → PptxGenJS PPTX → OOXML 검증 → preview)이 실제로 실행·검증되었다.
  - `pnpm m1` 결과: 스키마 통과, 검증 blocking 0/warning 0, MusicXML 11,806 bytes(결정적 확인), 슬라이드 4장, PNG 4장(2400×314px, 결정적), PPTX `out/worship-score-sample.pptx`(213,481 bytes, 4슬라이드).
  - OOXML 검증 13개 항목 전부 통과(`zip_loadable`, `content_types_present`, `root_rels_present`, `presentation_xml_present`, `presentation_rels_present`, `slides_present`, `slide_count_match`, `slide_master_present`, `slide_layout_present`, `media_present`, `all_xml_well_formed`, `relationship_targets_resolve`, `each_slide_has_image`).
  - 산출물 시각 확인: 슬라이드 PNG에 높은음자리표·4/4·멜로디 음표·마디선·한글 가사가 정확히 렌더됨(악보형 PPT 실증, 자막형 아님).
  - 테스트: vitest 27개 전부 통과(core 21 + pipeline fixture 5 + e2e 1). `tsc -p tsconfig.json` 타입체크 clean.
- **레이어 규칙이 강제 가능한 형태로 자리잡았다.** Domain이 외부 엔진을 import하지 않으므로, 이후 렌더러/빌더/OMR 엔진 교체가 Domain 변경 없이 어댑터 교체로 가능하다.
- **인프라 도입을 지연한 만큼, 미증명 가정을 줄였다.** 웹/DB/UI 결정을 Milestone 1 산출물(특히 ScoreIR 형태와 변환 체인의 실제 동작)을 본 뒤로 미룸으로써, 잘못된 추상화를 조기에 고정할 위험을 낮췄다.

### 부정적 결과 / 감수한 비용

- 현재 산출물은 **러너(CLI/스크립트) 형태**이며 사용자 대면 웹 표면이 없다. 데모 가능한 제품 UI는 Milestone 2+를 기다려야 한다.
- 모노레포·strict ESM·provider 인터페이스 선설계에 따른 **초기 보일러플레이트 비용**을 선지불했다(단일 앱 대비 패키지 경계·인터페이스 정의 오버헤드).
- provider 인터페이스를 실제 인프라 어댑터 없이 먼저 정의했으므로, **인터페이스가 실제 구현과 어긋날 가능성**이 남아 있다. Milestone 2+에서 어댑터를 구현하며 인터페이스를 조정해야 할 수 있다.

### 알려진 한계 (정직하게 기재)

- **결정적**: 동일 머신에서 ScoreIR → MusicXML, ScoreIR → SVG/PNG는 결정적임이 검증되었다.
- **미보장/미완**:
  - (a) PPTX **바이트 단위 결정성 미보장** — `pptxgenjs`가 생성 타임스탬프를 삽입한다. 추후 정규화 필요.
  - (b) **엄격한 W3C MusicXML XSD 검증 미구현** — 현재는 구조 검증 + Verovio 라운드트립(로드 성공)으로 대체. XSD 번들 도입은 추후.
  - (c) 실제 PowerPoint **'수리 경고 없이 열기' 라이브 테스트 미실행**(머신에 Office 없음) — 수동/CI 절차로 추적.
  - (d) 가사 텍스트의 **크로스-머신 폰트 결정성 미보장**(resvg가 시스템 폰트 사용) — 폰트 임베드/고정은 추후.

### 되돌리기 비용 (Reversibility)

- **본 결정의 핵심(모노레포 + core-first + provider 인터페이스)은 의도적으로 가산적(additive)이다.** Next.js/PostgreSQL/Chakra/큐/객체저장 도입은 *이 결정을 되돌리지 않고* 새 패키지(예: `apps/web`)와 새 어댑터를 추가하는 형태로 진행된다. 따라서 보류 결정을 해제하는 비용은 **낮다**.
- 반대로 빅뱅으로 풀스택을 먼저 세웠다면, 미증명 ScoreIR 형태에 웹/DB 스키마가 결합되어 *되돌리기 비용이 높았을 것*이다 — 이것이 본 결정의 주된 회피 대상이다.
- Domain이 외부 엔진을 import하지 않으므로, Verovio/PptxGenJS 같은 어댑터 교체 비용도 **국소적**이다(어댑터 1개 범위).

## Alternatives

### 대안 1: 처음부터 풀스택 Next.js 도입 (거부)

PRD 권장 스택(Next.js + PostgreSQL + Chakra + 큐 + 객체저장)을 그린필드 첫 커밋부터 함께 구축.

- **거부 사유**: **빅뱅 위험.** 제품의 가장 큰 미증명 위험(악보 변환 체인의 결정성·정확성)을, 검증 전에 풀스택 웹 인프라 구축 비용과 동시에 떠안게 된다. ScoreIR 형태가 확정되기 전에 DB 스키마·API·UI를 고정하면 잘못된 추상화를 조기에 굳히고, 이후 되돌리기 비용이 커진다. "빅뱅 금지" 원칙에 정면으로 위배된다.

### 대안 2: 단일 패키지(non-monorepo) 단일 앱 (거부)

모노레포 없이 단일 패키지에 Domain·Infrastructure·러너를 함께 둔다.

- **거부 사유**: Domain의 외부 엔진 비의존 규칙을 패키지 경계로 강제할 수 없게 되어, Verovio/PptxGenJS 의존이 Domain으로 새어들 위험이 크다. 이후 어댑터 교체·앱(`apps/web`) 추가 시 경계를 다시 그어야 한다. 모노레포의 선지불 비용은 낮고, 경계의 강제 효과가 더 가치 있다고 판단했다.

### 대안 3: 빌드 도구로 번들러/트랜스파일 파이프라인 선도입 (현 단계 보류)

webpack/esbuild 등 번들 단계를 Milestone 1부터 구성.

- **보류 사유**: Milestone 1은 라이브러리/러너 검증이 목적이므로 `tsx` 직접 실행으로 충분하다. 번들 결정은 웹 앱 도입(Milestone 2+) 시점에 그 요구사항을 보고 내리는 편이 낫다.

## 제3자 라이선스 (채택 시점 확정 버전 / SPDX)

| 컴포넌트 | 버전 | 라이선스 |
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

- **Audiveris** (OMR 후보, AGPL-3.0): **현재 의존성에 추가하지 않음.** 법무 승인 전 프로덕션 경로 금지. 별도 worker 분리만으로 AGPL 의무가 자동 해소된다고 가정하지 않는다. OMR은 Milestone 3 범위이며, 해당 마일스톤에서 별도 게이트로 다룬다. 본 결정 단계에서 Java가 미설치라 Audiveris/MuseScore CLI 사용은 불가하나, 이는 현 단계와 무관하다.

## 후속 영향 (이 결정이 여는 이후 마일스톤)

본 ADR의 보류 항목은 다음 마일스톤에서 가산적으로 해제된다(범위 확정).

- **M2** 업로드/작업 파이프라인(파일 업로드·권리확인·MIME 검사·객체저장·입력품질·job state machine·idempotency·retry) — 여기서 큐/객체저장 어댑터, 웹 표면이 처음 도입된다.
- **M3** OMR 기술검증(provider interface·mock·후보 엔진 spike·골든셋·품질/비용/시간 측정, Audiveris AGPL 게이트).
- **M4** ScoreIR 영속화/immutable revision/property test 강화 — DB 도입 지점.
- **M5** 런타임 AI 검증(model provider·tool contracts·structured output·prompt injection 방어).
- **M6** 검수 UI(3열) — UI 라이브러리 도입 지점.
- **M7** 발표구성/템플릿/PPT, **M8** 조직 라이브러리/통합 PPT, **M9** 상업화(과금·감사로그·백업·SBOM·라이선스 승인).

> 측정/확정되지 않은 정량 값(예: 크로스-머신 폰트 결정성, PPTX 바이트 결정성 정규화 결과, OMR 품질/비용/시간 지표)은 본 문서 기준 **TBD(추후 측정)**.
