# ADR-009: 사람 검수 릴리스 게이트 (Human Review Release Gate)

- 상태(Status): Accepted
- 일자(Date): 2026-06-16
- 결정자(Deciders): WorshipScore AI 구현 에이전트
- 관련(Related): ADR-000(스택 채택), PPT-003(음악 검증 게이트), PPT-004(OOXML 게이트)

## 컨텍스트 (Context)

WorshipScore AI는 찬양 악보 이미지/PDF를 구조화된 `ScoreIR`로 변환하고, 오선·멜로디·리듬·가사를 새로 조판하여 예배용 16:9 PPTX를 생성하는 **상업용 SaaS**다. 가사 자막형 PPT가 아니라 실제 악보를 렌더링한 발표 자료를 산출하므로, 잘못된 음높이·박자·조표·마디 구성이 그대로 최종 산출물에 반영되면 예배 현장에서 즉시 노출되는 품질 사고가 된다.

이 도메인에는 두 가지 구조적 위험이 있다.

1. **음악적 정합성 위험.** OMR(Milestone 3) 및 AI 추론(Milestone 5)이 도입되면 `ScoreIR`은 불확실성(`ScoreUncertainty`)을 내포한 추정 결과가 된다. 자동 파이프라인이 무검수로 최종 PPT를 내보내면, 음악적으로 깨진 악보가 사용자 확인 없이 배포된다.
2. **상업적 신뢰 위험.** 상용 MVP에서 사용자는 자신이 사용할 결과물을 최종적으로 통제할 수 있어야 한다. 자동 산출물을 사람의 명시적 확인 없이 "완료"로 간주하는 것은 상업 제품의 책임 모델과 맞지 않는다.

Milestone 1은 "빅뱅 금지 / 핵심 결정적 체인 우선 증명" 원칙에 따라 웹 프레임워크·DB·검수 UI 없이 결정적 변환 체인만 구현했다. 따라서 본 ADR은 **검수 UI 자체의 설계가 아니라, 그 UI가 의존할 릴리스 게이트의 불변식(invariant)을 코드 레벨에서 먼저 확정**하는 것을 목적으로 한다. 검수 UI(3열)는 Milestone 6, 발표 구성/PPT 산출은 Milestone 7의 범위다.

`packages/core`의 `validateScore()`는 이미 `ScoreValidationIssue`에 `severity`(`info | warning | error | fatal`)를 부여하는 12개 규칙을 구현하고 있다. 본 결정은 이 severity 모델 위에 **릴리스 차단의 의미론**을 명시한다.

## 결정 (Decision)

**음악 검증에서 `error` 또는 `fatal` 등급 이슈가 하나라도 존재하면, 해당 결과의 승인 및 최종 PPT 생성을 차단한다(PPT-003). 그리고 상용 MVP의 모든 결과물은 사람의 명시적 최종 확인을 거친 뒤에만 내보낸다.**

이를 두 개의 불변식으로 정의한다.

### 불변식 1 — 차단 게이트 (Blocking Gate, PPT-003)

`error`/`fatal` 등급이 존재하면 파이프라인은 PPT 생성 단계로 진행하지 않는다. `info`/`warning`은 진행을 막지 않으며 사람 검수의 참고 신호로만 사용한다.

이 의미론은 `packages/core`에서 단일 소스(single source of truth)로 계산된다.

- `packages/core/src/validation/index.ts` — `validateScore()`는 다음을 반환한다.
  - `hasBlocking = issues.some((i) => i.severity === "error" || i.severity === "fatal")`
  - `{ issues, ok: !hasBlocking, hasBlocking }`

즉 "차단 여부"는 호출자가 재해석하는 것이 아니라 도메인이 확정한다. UI·Use Case·러너는 `hasBlocking` 플래그를 신뢰하기만 하면 된다.

### 불변식 2 — 사람 최종 확인 (Human Final Confirmation)

차단되지 않은(`hasBlocking === false`) 결과라도, 상용 MVP에서는 사용자의 명시적 승인 없이 자동으로 외부로 내보내지 않는다. 자동 통과는 "기술적으로 차단 사유 없음"을 의미할 뿐, "사용자 의도와 일치함"을 의미하지 않기 때문이다. 따라서 최종 내보내기는 항상 사람 확인 뒤에 위치한다.

이 불변식의 UI 표면(검수 화면, 승인 동작)은 Milestone 6에서 구현되며, 본 ADR은 그 UI가 위배해서는 안 되는 계약을 확정한다: **승인 버튼은 `hasBlocking === false`일 때만 활성화될 수 있고, 활성화되었더라도 사용자의 명시적 승인이 최종 생성의 전제 조건이다.**

## 구현 근거 (Evidence)

본 결정은 Milestone 1에서 이미 실행·검증된 코드로 뒷받침된다.

- **도메인 차단 신호.** `packages/core/src/validation/index.ts`가 `hasBlocking`을 계산하여 반환한다(위 불변식 1의 정의 그대로). `error`/`fatal`만 차단으로 분류된다.
- **러너의 강제 중단.** `packages/pipeline/src/m1.ts`의 M1 러너는 `validateScore(score)` 직후 `validation.hasBlocking`이 참이면 다음과 같이 체인을 중단한다.
  - `throw new Error(\`음악 검증 실패: ${blocking.length}건의 error/fatal로 승인·생성 차단 (PPT-003)\`)`
  - 이 throw는 MusicXML 직렬화·Verovio 렌더·slide plan·PptxGenJS 생성 **이전**에 위치하므로, 차단 사유가 있는 입력은 어떤 PPT 산출물도 만들지 못한다.
- **게이트 일관성.** 동일 러너는 PPTX 생성 후 OOXML 검증 실패 시에도 다운로드 상태 전환을 차단한다(`PPT-004`). PPT-003(입력 음악 검증 게이트)과 PPT-004(출력 패키지 무결성 게이트)는 "사람 검수 가능한 안전 상태에서만 다음 단계로 진행"이라는 동일 원칙의 입·출력 양단 적용이다.
- **현재 동작 확인.** `pnpm m1` 실행에서 합성 fixture(`packages/pipeline/src/fixtures/cleanDigitalSample.ts`, C major / 4/4 / 8마디 / 2절)는 blocking 0건·warning 0건으로 게이트를 통과했고, 정상 경로(차단 없음 → 생성 진행)가 4슬라이드 PPTX 산출까지 동작함이 검증되었다. 차단 경로(throw)는 동일 코드 경로상의 분기로 존재하나, 실패 입력에 대한 차단 동작의 회귀 테스트는 'TBD(추후 측정)'다.

## 대안 (Alternatives Considered)

- **자동 내보내기(무검수) + 사후 신고.** 차단 게이트 없이 항상 PPT를 생성하고, 문제 발견 시 사용자가 사후 보고. → 예배 현장 노출형 사고를 사전 차단하지 못하며 상업 제품 신뢰 모델과 충돌. 기각.
- **warning까지 차단.** `warning`도 생성을 막아 보수적으로 운영. → 정상 음악에서도 흔히 발생하는 경고성 신호가 정상 흐름을 막아 사용성을 크게 해침. severity 모델이 `error`/`fatal`을 별도로 둔 의도와 배치. 기각. (`warning`은 검수 화면에서 강조 표시로 처리.)
- **차단 판정을 UI/Use Case 레이어에서 재계산.** 각 호출자가 `issues`를 보고 직접 차단 여부를 판단. → 판정 로직이 분산되어 레이어 간 불일치 위험. 도메인이 `hasBlocking`을 확정하는 단일 소스 원칙(레이어 규칙: Domain이 정합성 판정 소유)에 위배. 기각.

## 결과 (Consequences)

### 긍정적

- 차단 의미론이 `packages/core`에 단일화되어, UI·Use Case·인프라 어댑터가 동일한 게이트를 공유한다(레이어 규칙 준수).
- 음악적으로 깨진 결과가 사람 확인 없이 내보내질 수 없다는 보장이 코드 레벨 불변식으로 고정된다.
- Milestone 6 검수 UI는 새 판정 로직을 만들 필요 없이 `hasBlocking`/`issues`만 소비하면 된다.

### 부정적 / 비용

- 모든 상용 결과물에 사람 확인 단계가 강제되므로, 완전 무인 자동화 경로는 (의도적으로) 제공하지 않는다. 배치/대량 처리 시 검수 처리량이 병목이 될 수 있다(완화책: warning 분류 정교화, 검수 UI 효율화 — Milestone 6+).
- 12개 규칙의 severity 배정 정확성에 게이트 신뢰도가 종속된다. 규칙이 차단성 오류를 `warning` 이하로 과소 분류하면 게이트가 새는 위험이 있다(규칙 강화는 Milestone 4 property test에서 추적).

### 미해결 / 추적 항목 (Open Items)

- 차단 경로(실패 입력 → 생성 차단)에 대한 전용 회귀 테스트 부재 — 'TBD(추후 측정)'. Milestone 6에서 UI 계약과 함께 추가 예정.
- 사람 검수의 승인 상태/감사 추적(누가·언제 승인했는가)은 영속화·감사로그(Milestone 4, Milestone 9)에 종속 — 본 ADR 범위 밖.
- "승인 버튼은 `hasBlocking === false`에서만 활성"이라는 UI 계약의 강제 테스트는 Milestone 6 — 'TBD(추후 측정)'.

## 적용 범위 및 상태 추적

- 본 ADR이 확정하는 것: 차단 게이트(PPT-003)의 의미론과 사람 최종 확인 불변식, 그리고 도메인 단일 소스(`hasBlocking`) 원칙.
- 본 ADR이 확정하지 않는 것(후속 Milestone): 검수 UI(M6), 발표 구성/PPT 산출 흐름(M7), 승인 영속화·감사로그(M4/M9).
- 실제 PowerPoint '수리 경고 없이 열기' 라이브 검증은 머신에 Office가 없어 미실행이며, 수동/CI 절차로 추적한다(이는 PPT-004 출력 게이트의 후속 항목으로, 본 입력 게이트와는 독립적으로 진행).
