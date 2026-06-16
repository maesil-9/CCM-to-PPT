# ADR-003: 런타임 AI와 결정적 엔진 경계 (Runtime AI vs. Deterministic Engine Boundary)

- **Status**: Accepted
- **Date**: 2026-06-16
- **Deciders**: WorshipScore AI 구현 에이전트
- **Related**: ADR-000 (스택 채택 / "빅뱅 금지, Milestone 1 우선 증명")
- **Schema/Version 참조**: `SCOREIR_SCHEMA_VERSION = 'scoreir-0.1.0'`, MusicXML 4.0 score-partwise, presentation profile `profile-0.1.0`

## Context (배경)

WorshipScore AI는 찬양 악보 이미지/PDF를 구조화된 악보 데이터(`ScoreIR`)로 변환하고, 오선·멜로디·리듬·가사가 포함된 예배용 16:9 PPTX를 새로 조판·생성하는 상업용 SaaS다. 가사 자막형 PPT가 아니라, 실제 오선보가 슬라이드에 렌더되는 악보형 산출물을 만든다.

이 도메인은 두 가지 성질이 충돌한다.

1. **악보의 음악적 정확성은 결정적이어야 한다.** 동일한 입력은 동일한 `ScoreIR`, 동일한 MusicXML, 동일한 렌더 결과를 내야 하며, 음표·박자·조성은 검증 가능한 규칙으로 통제되어야 한다. 잘못된 음 하나가 예배 현장에서 그대로 노출되면 상업 제품으로서 신뢰를 잃는다.
2. **광학 악보 인식(OMR)과 OCR은 본질적으로 불확실하다.** 스캔 품질, 손글씨, 인쇄 변형 때문에 어떤 엔진도 100% 정답을 보장하지 못한다. 여러 후보 중 어느 것이 옳은지, 어느 영역을 사람이 검수해야 하는지 판단하는 데에는 모델의 추론(AI)이 유용하다.

문제는 이 둘을 분리하지 않으면 비결정성과 환각(hallucination)이 핵심 산출물(음표, MusicXML, PPTX)로 새어 들어간다는 점이다. 생성형 모델이 음표를 "그럴듯하게" 만들어내거나, MusicXML을 자유 생성하거나, PPTX를 직접 합성하면 산출물의 재현성·검증 가능성·법적 추적성이 모두 무너진다.

Milestone 1에서 이미 결정적 체인의 실증을 마쳤다(ADR-000 원칙에 따라 AI/OMR/웹/DB 없이 핵심 체인을 먼저 증명). 확인된 체인은 다음과 같다.

```
ScoreIR → zod schema → validateScore → MusicXML 4.0 → Verovio(SVG+PNG) → slide plan → PptxGenJS PPTX → OOXML 검증 → preview(PNG)
```

`pnpm m1` 실행에서 스키마 통과, 검증 blocking 0 / warning 0, MusicXML 11806 bytes(결정적 확인), 슬라이드 4장, PNG 4장(2400×314px, 결정적), PPTX 213,481 bytes(4슬라이드)가 산출되었고, OOXML 검증 13개 항목 전부 통과, vitest 27개 전부 통과, `tsc` 타입체크 clean이었다. 즉 **결정적 절반은 이미 코드로 존재하며, 이 ADR은 향후 도입될 런타임 AI(Milestone 3·5)가 그 절반을 침범하지 못하도록 경계를 못 박는 것**이 목적이다.

## Decision (결정)

런타임 AI와 결정적 엔진 사이에 **단방향 경계**를 둔다. 핵심 규칙은 다음과 같다.

### 1. 결정적 코드만이 수행하는 영역 (AI 금지)

다음은 반드시 결정적 코드로만 수행하며, 어떤 런타임 AI도 이 산출물을 직접 생성하거나 변형할 수 없다.

- **렌더링**: MusicXML → SVG/PNG. `packages/adapters/src/verovio/renderer.ts`의 `VerovioRenderer`(verovio 6.2.0 WASM + @resvg/resvg-js 2.6.2). `runId`는 입력 해시(FNV-1a)로 결정.
- **MusicXML 변환**: `ScoreIR` → MusicXML 4.0 score-partwise. `packages/core/src/musicxml/{xml.ts,serialize.ts}`의 결정적 직렬화.
- **PPT 생성**: slide plan → PPTX. `packages/adapters/src/pptx/builder.ts`의 `PptxGenJsBuilder`(pptxgenjs 4.0.1), 16:9(13.333×7.5in), contain-fit 배치.
- **검증**: `packages/core/src/validation/index.ts`의 `validateScore()`(12개 규칙), `packages/adapters/src/pptx/ooxml.ts`의 `validatePptxOoxml`(13개 항목).
- **슬라이드 계획**: `packages/core/src/presentation/slidePlan.ts`의 `planPresentation()`(섹션 경계 우선 분할, 마디 미분할).

### 2. 런타임 AI가 허용되는 영역 (제안·판단만)

런타임 AI는 결정적 산출물을 만드는 것이 아니라, 사람·결정적 코드가 사용할 **신호(signal)**를 생산한다. 허용 범위는 다음으로 한정한다.

- **OMR/OCR 후보 비교**: 복수 OMR 엔진/패스가 만든 후보를 비교·랭킹.
- **불확실 영역 판단**: 어느 `SourceRegion` / 마디 / 음표가 신뢰도 낮은지 식별(`ScoreUncertainty`로 표현).
- **구조화 제안(suggestion)**: 사람이 채택하기 전까지는 비구속(non-binding) 제안으로만 존재. 예) 반복 구조 후보, 가사-음표 정렬 후보.
- **검수 우선순위 산정**: 사람이 먼저 봐야 할 영역의 순서 제안(검수 UI는 Milestone 6).

### 3. 명시적 금지 (Hard Prohibitions)

- AI가 **음표를 확정**(authoritative note value 결정)하지 않는다. 확정은 결정적 검증을 통과한 데이터와 사람의 승인으로만 이루어진다.
- AI가 **MusicXML을 자유 생성**하지 않는다. MusicXML은 오직 `ScoreIR`로부터 결정적 직렬화로만 생성된다.
- AI가 **PPTX를 직접 생성**하지 않는다. PPTX는 오직 slide plan으로부터 결정적 빌더로만 생성된다.

### 4. 경계의 형태 (단방향, IR을 통한 매개)

- 모든 AI 출력은 `ScoreIR`의 **증거/불확실성 필드**(`EvidenceSource`, `ScoreUncertainty`, `SourceRegion`)를 통해서만 시스템에 진입한다. 결정적 산출물(MusicXML/PNG/PPTX)을 직접 생산하는 경로로는 진입할 수 없다.
- AI 출력은 사람 또는 결정적 규칙이 채택(accept)하기 전까지 산출물에 반영되지 않는다. 즉 **AI → 제안 → (사람/규칙 게이트) → 확정 IR → 결정적 엔진**의 단방향 흐름만 허용한다.
- 아키텍처 레이어 규칙과 일치한다: Domain(`packages/core`)은 외부 엔진/SDK를 직접 import하지 않으며, AI 모델 SDK 또한 Provider Interface 뒤(Infrastructure Adapter)에 격리된다. Domain은 모델을 알지 못한다.

### 5. Provider 인터페이스로의 격리

런타임 AI는 도메인이 의존하는 추상 인터페이스 뒤에 둔다. `packages/core/src/types/providers.ts`에는 이미 `VisionReviewProvider`, `OMRProvider`가 정의되어 있다. 런타임 AI 모델 제공자(model provider), tool contracts, structured output, prompt injection 방어의 구체 설계는 **Milestone 5(런타임 AI 검증)**의 범위이며, 본 ADR은 그 구현이 따라야 할 경계 계약을 규정한다.

- structured output 강제: AI는 자유 텍스트가 아니라 스키마(zod)로 검증되는 구조화 출력만 반환한다. 구체 스키마는 TBD(추후 측정).
- prompt injection 방어: 업로드 이미지/메타데이터에서 유입되는 지시 주입에 대한 방어 정책은 Milestone 5에서 정의. 현재 TBD(추후 측정).

## Consequences (결과)

### 긍정적 (Positive)

- **재현성 보존**: 결정적 절반이 AI의 비결정성으로 오염되지 않는다. Milestone 1에서 확인된 결정성(ScoreIR→MusicXML, ScoreIR→SVG/PNG 동일 머신 결정적)이 AI 도입 이후에도 구조적으로 유지된다.
- **검증 가능성**: 모든 확정 산출물은 결정적 코드가 생산하므로 `validateScore()` 12개 규칙과 OOXML 13개 항목으로 항상 검증 가능하다. AI 출력은 IR 안에서 증거/불확실성으로만 존재하므로 별도로 감사할 수 있다.
- **법적/상업적 추적성**: 무엇이 기계 생성(결정적)이고 무엇이 모델 제안(AI)이며 무엇이 사람 승인인지 IR 수준에서 분리 기록된다. Milestone 9(감사로그/SBOM/라이선스 승인)와 정합한다.
- **품질 게이트의 단일 책임**: "옳은가?"는 결정적 검증이, "어디를 의심할까?"는 AI가 맡아 책임이 겹치지 않는다.

### 부정적 / 비용 (Negative / Costs)

- AI가 산출물을 직접 만드는 것보다 파이프라인이 길어진다(제안 → 게이트 → 확정 IR → 엔진). 단계 증가에 따른 지연/복잡도는 감수한다.
- AI의 유용한 출력도 IR 스키마에 담기지 않으면 버려진다. 증거/불확실성 필드 모델링에 선투자가 필요하다.

### 한계 / 미해결 (정직한 기재)

본 경계는 결정적 산출물을 보호하지만, 결정성 자체가 아직 모든 축에서 완전하지는 않다. 다음은 AI 경계와 별개로 추적 중인 미완 항목이다.

- **PPTX 바이트 단위 결정성 미보장**: pptxgenjs가 생성 타임스탬프를 삽입 → 추후 정규화 필요(TBD, 추후 측정).
- **엄격한 W3C MusicXML XSD 검증 미구현**: 현재는 구조 검증 + Verovio 라운드트립(로드 성공)으로 대체. XSD 번들 도입은 추후(TBD).
- **실제 PowerPoint '수리 경고 없이 열기' 라이브 테스트 미실행**: 머신에 Office 없음 → 수동/CI 절차로 추적(TBD).
- **가사 텍스트 크로스-머신 폰트 결정성 미보장**: resvg 시스템 폰트 사용 → 폰트 임베드/고정은 추후(TBD).

이 한계들은 "AI가 음표/MusicXML/PPTX를 만들지 않는다"는 본 ADR의 핵심 결정과 충돌하지 않으며, 결정적 경로 내부의 후속 강화 과제로 분리된다.

## Alternatives Considered (검토한 대안)

1. **AI에게 MusicXML/PPTX를 직접 생성시킨다 (end-to-end 생성형)**
   - 기각: 환각·비결정성이 핵심 산출물로 직접 유입되어 재현성·검증·상업적 추적성이 모두 붕괴. 음악적 정확성이 모델 신뢰도에 종속된다.

2. **AI 출력을 결정적 검증 없이 곧바로 확정 IR로 승격**
   - 기각: `validateScore()` 게이트를 우회하게 되어 잘못된 음표 확정 가능. 사람/규칙 게이트 없는 자동 승격은 금지.

3. **AI를 전혀 사용하지 않고 순수 결정적 OMR만 사용**
   - 부분 채택/연기: 현재 Milestone 1은 사실상 이 형태(AI 없음). 그러나 OMR 후보 비교·불확실 영역 판단·검수 우선순위에서 모델 추론의 효용이 크므로, 결정적 산출물을 침범하지 않는 **제안·판단 역할로 한정**하여 도입한다(Milestone 3·5).

4. **AI를 별도 worker로 물리 분리하면 충분하다고 가정**
   - 부분 기각: 프로세스 분리는 운영상 유용하나, 그것만으로 경계가 보장되지 않는다. 경계는 데이터 흐름(IR 매개·단방향·게이트)으로 강제해야 한다. (참고: Audiveris의 AGPL-3.0 의무 또한 worker 분리만으로 자동 해소된다고 가정하지 않으며, 법무 승인 전 프로덕션 경로 금지 — Milestone 3 게이트.)

## Compliance / Enforcement (준수 방법)

- **레이어 규칙**: `packages/core`(Domain)는 외부 엔진/AI SDK를 직접 import하지 않는다. AI는 `providers.ts`의 인터페이스(`VisionReviewProvider`, `OMRProvider`) 뒤에 격리.
- **타입 게이트**: 확정 산출물 생성 함수(MusicXML 직렬화, PPTX 빌더)는 입력으로 검증된 `ScoreIR`/slide plan만 받는다. AI 제안 타입은 별도(`ScoreUncertainty`/`EvidenceSource`)로 두어 타입 시스템이 혼입을 막는다.
- **검증 게이트**: 모든 확정 IR은 `validateScore()`를 통과해야 하며, blocking issue 존재 시 결정적 엔진으로 진행하지 않는다.
- **structured output**: AI 응답은 zod로 파싱/검증되어야 하며 파싱 실패 시 제안으로 채택하지 않는다(구체 스키마 Milestone 5, TBD).
- **테스트**: 결정성/경계 위반을 잡는 회귀 테스트는 vitest로 유지(현재 27개 통과). AI 경로 추가 시 "AI 출력이 확정 산출물 경로로 진입하지 않음"을 검증하는 테스트를 추가한다(Milestone 5, TBD).

## Notes (참고)

- 본 ADR이 규정하는 런타임 AI 구현 자체는 아직 미구현이며 Milestone 3(OMR 기술검증)·Milestone 5(런타임 AI 검증)에서 도입된다. 본 문서는 그 구현이 반드시 따라야 할 경계 계약을 사전 고정하기 위한 것이다.
- 모델 종류, 비용/지연 측정치, prompt injection 방어 구체안, structured output 스키마는 모두 TBD(추후 측정).
