# ADR-004: 불변 Score Revision

- **Status**: Accepted (개념/타입 수준 — 영속화는 Milestone 2/M4)
- **Date**: 2026-06-16
- **Deciders**: WorshipScore AI 구현 에이전트
- **Related**: ADR-000 (스택 채택, 빅뱅 금지 원칙), PRD §10 (ScoreIR), `packages/core/src/types/scoreir.ts`, `packages/core/src/types/validation.ts`

## Context

WorshipScore AI는 찬양 악보 이미지/PDF를 구조화된 악보 데이터(ScoreIR)로 변환하고, 그 데이터로부터 예배용 16:9 PPTX를 새로 조판·생성하는 상업용 SaaS다. 단순 가사 자막형 PPT가 아니라 오선·멜로디·리듬·가사를 포함한 악보형 산출물을 생성하므로, 하나의 곡(score)에 대한 데이터는 여러 단계의 처리를 거치며 점진적으로 정제된다.

처리 단계는 본질적으로 신뢰도와 출처가 서로 다른 데이터를 연속해서 쌓는 과정이다. 이 출처 구분은 이미 도메인 타입에 반영되어 있다. `ScoreIR` 타입(`packages/core/src/types/scoreir.ts`)은 `EvidenceSource`를 통해 출처를 명시하며, `EvidenceType`은 다음 다섯 값을 정의한다.

- `omr` — 광학 악보 인식 엔진 출력 (Milestone 3)
- `ocr` — 텍스트/가사 인식
- `vision_model` — AI 비전 모델 보정 (Milestone 5)
- `rule_validator` — `validateScore()` 규칙 검증기 (Milestone 1에서 12개 규칙 구현됨)
- `manual` — 사용자 수동 입력/수정

또한 `ScoreUncertainty`(`status`: `open` | `resolved` | `dismissed`)와 per-field `confidence`(`NoteConfidence`)는 자동 인식과 사람 판단이 같은 필드를 두고 경합할 수 있음을 전제로 한다.

이런 다단계·다출처 처리에서 가장 큰 데이터 무결성 위험은 **사람의 결정이 자동 처리에 의해 조용히 덮어써지는 것**이다. 구체적으로:

1. 사용자가 검수 UI(Milestone 6)에서 OMR 오인식을 수정한 뒤, 어떤 이유로 원본이 재처리(re-OMR / 재-AI보정)되면, 새 자동 출력이 사용자 수정을 덮어쓸 수 있다.
2. 승인된(approved) 산출물이 사실상의 "출고본"으로 통합 PPT(Milestone 8)나 조직 라이브러리에 쓰이는데, 승인 이후 하위 데이터가 변경되면 승인의 의미가 무너진다.
3. 상업화 단계(Milestone 9)에서 감사 로그·과금·분쟁 대응을 위해 "어느 시점에 누가/무엇이 이 값을 만들었는가"를 사후에 재구성할 수 있어야 한다.

가변(mutable) 단일 레코드를 in-place 갱신하는 모델은 위 세 요구를 동시에 만족할 수 없다. 따라서 처리 단계별 상태를 **불변(immutable) revision**으로 분리 보관하는 모델을 채택한다.

본 ADR 작성 시점의 실제 코드 범위는 결정적 핵심 체인(ScoreIR → MusicXML → Verovio → PptxGenJS → OOXML 검증)이며 영속화 계층은 아직 없다(Milestone 1 결과 기준). 따라서 본 결정은 **개념과 도메인 타입 수준의 계약**을 확정하는 것이고, 실제 저장소 구현은 Milestone 2(업로드/작업 파이프라인) 및 Milestone 4(ScoreIR 영속화/immutable revision/property test 강화)에서 이뤄진다.

## Decision

### 1. Revision 종류를 출처별로 분리 보관한다

하나의 score(`scoreId`)에 대해 다음 종류의 산출물을 각각 **별도의 불변 revision**으로 보관한다. 각 revision은 `EvidenceSource`로 자신의 출처를 명시한다.

| Revision kind | 주된 EvidenceType | 생성 주체 | 도입 Milestone |
| --- | --- | --- | --- |
| `original` | (입력 자산 자체) | 업로드된 원본 이미지/PDF의 ScoreIR 초기 표현 또는 손-저작 ScoreIR | M1(fixture) / M2(업로드) |
| `omr` | `omr`, `ocr` | OMR/OCR 엔진 출력 | M3 |
| `ai_corrected` | `vision_model` | 런타임 AI 검증/보정 | M5 |
| `user_edited` | `manual` | 검수 UI의 사용자 수정 | M6 |
| `approved` | (상위 revision 승인) | 사용자/검수자의 승인 행위 | M6/M7 |

(위 kind 식별자 문자열의 정확한 enum 명칭과 영속화 스키마는 M4에서 확정한다. 현재는 `EvidenceType`이 이미 출처 축을 정의하고 있으므로, revision kind는 그 위에 얹히는 계층으로 설계한다.)

### 2. Revision은 불변이다 (append-only)

- 한 번 생성된 revision의 내용(payload ScoreIR + EvidenceSource)은 수정하지 않는다. 변경은 항상 **새 revision 추가**로 표현한다.
- revision 간 관계는 선형 덮어쓰기가 아니라 **유래(provenance) 그래프**로 본다: 각 revision은 자신이 파생된 부모 revision(들)을 참조한다(예: `ai_corrected`는 어떤 `omr` revision을 입력으로 했는가). 부모 참조의 정확한 필드 형태는 M4에서 확정.
- 이미 `SourceRegion.contentHash`, `EvidenceSource.runId`(Verovio 어댑터에서 입력 해시 기반 결정적 runId 생성 패턴 존재)가 있어, revision 식별·중복판정에 콘텐츠 해시를 사용할 토대가 마련되어 있다.

### 3. 재처리는 사용자 수정을 덮어쓸 수 없다

- 원본 또는 자동 단계의 재처리(re-OMR, 재-AI보정)는 항상 **새로운 자동 revision을 추가**할 뿐, 기존 `user_edited` revision을 변형하거나 무효화하지 않는다.
- 재처리 결과를 사용자 수정과 병합하는 행위(merge)는 자동으로 일어나지 않으며, 명시적 사용자 액션 또는 정의된 머지 정책에 의해서만 **또 다른 새 revision**으로 생성된다.
- 즉, "최신 자동 출력 = 현재 진실"이라는 암묵적 가정을 금지한다. 어떤 revision이 화면/PPT 생성의 입력이 되는지는 별도의 포인터(아래 4)가 명시적으로 결정한다.

### 4. 승인 리비전이 변경되면 승인이 해제된다

- `approved` 상태는 특정 revision을 가리키는 명시적 포인터(approval)다.
- 승인의 대상이 된 데이터 계보에 새 revision이 추가되어 "현재 활성 revision"이 승인된 revision과 달라지면, 해당 approval은 **자동으로 무효(해제)** 처리되고 재승인이 요구된다.
- 이는 "approved 표식이 가리키던 바이트와, 실제로 PPT를 생성할 때 쓰이는 바이트가 일치한다"는 불변식(invariant)을 보장하기 위한 것이다. 승인은 불변 revision의 콘텐츠 해시에 결속되므로, 콘텐츠가 바뀌면 해시가 바뀌고 승인은 더 이상 유효하지 않다.

### 5. 검증 결과는 revision에 결속된다

`validateScore()`가 산출하는 `ScoreValidationResult`(`severity`: `info` | `warning` | `error` | `fatal`)는 특정 revision의 ScoreIR에 대한 판정이므로, 검증 결과 역시 그 revision에 귀속하여 보관한다. 재처리로 새 revision이 생기면 검증도 새 revision 기준으로 다시 수행한다(기존 revision의 판정을 덮어쓰지 않음).

## Consequences

### 긍정적

- **사용자 신뢰 보호**: 사람이 들인 수정 노동이 자동 파이프라인에 의해 소실되지 않는다(핵심 제품 위험 제거).
- **감사 가능성**: 모든 값의 출처(`EvidenceSource`)와 계보가 보존되어 M9의 감사 로그/분쟁 대응/과금 근거 재구성이 가능하다.
- **승인 무결성**: approved revision은 콘텐츠 해시에 결속되어, 승인된 산출물과 실제 생성 입력의 불일치를 구조적으로 방지한다.
- **결정성과의 정합**: 핵심 체인(ScoreIR → MusicXML, → SVG/PNG)이 이미 동일 머신에서 결정적이므로, 불변 revision + 결정적 변환은 "같은 revision → 같은 산출물"을 향한 토대를 함께 형성한다.
- **재처리의 안전성**: 재처리가 부작용 없는 append이므로, OMR 엔진 교체·AI 모델 업그레이드 시에도 기존 데이터가 위험에 빠지지 않는다.

### 부정적 / 비용

- **저장 비용 증가**: revision마다 ScoreIR 스냅샷을 보관하면 저장량이 누적된다. 구조적 공유(structural sharing)나 델타 저장 여부는 M4에서 결정 — 정량적 저장 비용은 **TBD(추후 측정)**.
- **활성 revision 선택 로직 필요**: "현재 어떤 revision이 진실인가"를 결정하는 포인터/정책이 별도로 필요하다(단순 latest-wins 금지). 머지 정책의 구체 설계는 M4/M6의 과제.
- **승인 자동 해제의 UX 비용**: 작은 변경에도 재승인이 요구되면 검수자 피로가 생길 수 있다. 변경 영향 범위에 따른 재승인 정책의 세분화 가능성은 추후 검토.

## Alternatives Considered

- **단일 가변 레코드 in-place 갱신** — 재처리가 사용자 수정을 덮어쓰는 데이터 손실을 막을 수 없고, 출처/계보가 소실되어 감사 불가. 거부.
- **단순 latest-wins 버전 체인(선형 덮어쓰기)** — "최신이 곧 진실"을 가정하므로 자동 재처리가 사용자 수정보다 항상 우선하게 되어 ADR의 핵심 요구(재처리 덮어쓰기 금지)와 충돌. 거부.
- **출처 무시 단일 revision + 필드별 플래그로 사용자수정 보호** — `confidence`/`ScoreUncertainty`로 부분적 표현은 가능하나, revision 단위의 불변 스냅샷·승인 결속·계보 재구성을 만족하지 못함. 거부(다만 per-field `confidence`와 `ScoreUncertainty`는 revision 모델 위에서 보완적으로 계속 사용).

## Implementation Notes (현재 상태와 범위)

- **현재 코드에 존재하는 토대**: `EvidenceSource`/`EvidenceType`/`ScoreUncertainty`/`NoteConfidence`(`packages/core/src/types/scoreir.ts`), `SourceRegion.contentHash`, 결정적 변환 체인, `validateScore()` 12규칙. 이들은 본 ADR이 전제하는 출처·신뢰도·해시 축을 이미 제공한다.
- **본 ADR이 아직 구현하지 않는 것**: revision 영속화 스토어, revision kind enum 확정, 부모(provenance) 참조 필드, approval 포인터와 자동 해제 로직, 활성 revision 선택/머지 정책, property test. 모두 **Milestone 2/M4**(일부 M5/M6)에서 구현한다.
- **검증 전략(추후)**: revision 불변성·재처리 비파괴성·승인 해제 불변식은 M4의 property test로 검증할 예정. 구체 테스트 케이스와 커버리지는 **TBD(추후 측정)**.

## Directive

이 코드를 후에 수정하는 사람에게: revision은 append-only다. 어떤 처리 경로에서도 기존 `user_edited`/`approved` revision을 in-place로 변형하거나 삭제하지 말 것. "최신 자동 출력이 곧 현재 진실"이라는 단축 경로를 도입하지 말 것 — 활성 revision은 항상 명시적 포인터/정책으로만 결정한다.
