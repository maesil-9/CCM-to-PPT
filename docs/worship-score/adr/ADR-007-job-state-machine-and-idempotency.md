# ADR-007: Job State Machine + Idempotency

- **Status**: Proposed (방향 확정, 미구현)
- **Date**: 2026-06-16
- **Milestone**: M2 (업로드/작업 파이프라인) — 본 ADR은 M2 착수 전 방향을 확정한다.
- **Deciders**: WorshipScore AI 구현 에이전트
- **Related**: PRD §11 (처리 상태 머신), PRD §12.3 / `packages/core/src/types/providers.ts` (`JobQueueProvider`, `ObjectStorageProvider`), ADR-000 (스택 채택 원칙 "빅뱅 금지 / Milestone 1 우선 증명")

---

## Context

WorshipScore AI는 찬양 악보 이미지/PDF를 구조화된 `ScoreIR`로 변환하고 예배용 16:9 PPTX를 조판·생성하는 상업용 SaaS다. Milestone 1에서 핵심 결정적 체인(ScoreIR → MusicXML 4.0 → Verovio SVG/PNG → slide plan → PptxGenJS PPTX → OOXML 검증)은 실제 실행으로 증명되었으나, 사용자 업로드를 받아 이 체인을 비동기로 구동하는 **작업(job) 수명주기**는 아직 존재하지 않는다.

이 작업 파이프라인은 다음 두 가지 성질을 동시에 요구한다.

1. **명시적 상태 전이**: PRD §11이 정의하는 처리 상태 머신(`uploaded` … `completed` / `failed*`)을 통해 작업이 진행되어야 하며, 각 단계(OMR, ScoreIR 검증, 렌더, PPTX 생성)는 비용·시간이 큰 비동기 단계다. 클라이언트가 상태를 임의로 조작하면 과금·산출물 무결성이 깨진다.
2. **중복 금지(idempotency)**: 업로드 재시도, 네트워크 단절 후 재요청, 큐 at-least-once 전달, 동시 더블클릭 등으로 인해 **동일 작업이 중복 실행/중복 과금**될 위험이 상존한다. OMR 및 (M5의) 런타임 AI 검증은 외부 비용을 발생시키므로 중복 실행은 금전 손실로 직결된다.

현재 `@worship-score/core`에는 `JobQueueProvider`와 `ObjectStorageProvider` 인터페이스가 **선언만** 되어 있고(메서드는 M2에서 정의), `GeneratePptxInput`에는 이미 선택적 `idempotencyKey?: string` 필드가 존재한다. 즉 도메인 경계는 이 결정을 수용할 준비가 되어 있으나, 상태 머신 자체와 idempotency 강제 규칙은 미구현이다.

본 ADR은 구현 없이 **상태 머신의 정의·전이 권한·idempotency 보장 모델의 방향**을 확정한다.

---

## Decision

### D1. 상태 전이는 서버 측에서만 수행한다

처리 상태 머신은 서버 측 권위 있는(authoritative) 컴포넌트만 전이를 수행한다. 클라이언트는 상태를 **관찰**할 수 있을 뿐, 상태 값을 요청 본문으로 설정하거나 전이를 지시할 수 없다. 클라이언트가 보낼 수 있는 것은 의도(intent)뿐이며(예: 업로드 제출, 재시도 요청), 그 의도를 검증한 뒤 상태를 전이시키는 책임은 전적으로 서버에 있다.

- 모든 전이는 **허용된 전이 표(transition table)** 에 대해 검증된다. 표에 없는 전이는 거부한다.
- 상태 값과 전이 표는 도메인(`@worship-score/core`)에서 타입·규칙으로 정의하고(레이어 규칙상 Domain은 외부 엔진을 import하지 않는다), 영속화·실행은 Infrastructure 어댑터(`JobQueueProvider`, `ObjectStorageProvider`, 추후 영속 store)가 담당한다. 이는 ADR-000의 레이어 규칙(UI → Application Use Cases → Domain → Provider Interfaces → Infrastructure Adapters)을 따른다.

### D2. 상태 모델 (PRD §11 기반)

상태 집합과 전이의 **방향**은 PRD §11을 권위 있는 출처로 채택한다. 핵심 상태:

- `uploaded` — 입력 수신 완료(이후 단계의 시작점)
- (중간 처리 단계들) — OMR / ScoreIR 검증 / 렌더 / PPTX 생성 / OOXML 검증에 대응하는 단계. 단계별 정확한 상태 이름과 세분도는 **TBD(추후 측정)**: M2 설계 시 PRD §11의 정확한 라벨 집합으로 확정한다.
- `completed` — 성공 종료(terminal)
- `failed*` — 실패 종료군(terminal). 실패 원인 분류(예: 입력 품질 실패, 엔진 실패, 검증 fatal 등)의 정확한 세분도는 **TBD(추후 측정)**.

규칙:

- `completed`와 `failed*`는 **terminal** 상태로 간주한다. terminal 상태에서의 추가 전이는 금지하며, 재처리는 새 작업(또는 새 revision)으로 모델링한다.
- 각 전이는 (이전 상태, 이벤트, 다음 상태)로 구성되며 표에 명시된 조합만 허용한다.
- 실패는 **삼킨다(swallow)** 가 아니라 명시적 `failed*` 상태와 진단으로 표면화한다. ScoreIR 검증의 `severity`(`info | warning | error | fatal`, `ScoreValidationIssue`)와 정합되게, blocking 이슈(`error`/`fatal`)는 적절한 `failed*` 전이를 유발해야 한다.

### D3. Idempotency: 동일 key의 중복 실행/중복 과금 금지

- **Idempotency key**는 작업을 식별하는 안정적 토큰이다. 동일 idempotency key로 들어온 두 번째 이후 요청은 **새 작업을 시작하지 않고**, 최초 작업의 현재 상태/결과를 반환한다(과금도 1회만 발생).
- key의 산출 방식(클라이언트 제공 vs 입력 콘텐츠 해시 vs 둘의 결합)은 **TBD(추후 측정)**. 다만 Milestone 1에서 결정적 체인이 입력 해시(FNV-1a) 기반 `runId`로 재현성을 확보한 선례가 있으므로, **입력 콘텐츠 해시를 idempotency key 산출의 후보 입력**으로 검토한다(확정 아님).
- idempotency 레코드는 (key → 작업 식별자, 현재 상태, 결과 포인터)의 매핑을 영속화하며, 이 매핑의 생성은 **원자적**이어야 한다(동시 요청 경합에서 정확히 하나의 작업만 생성). 구체적 원자성 메커니즘(고유 제약 / 조건부 쓰기 / 분산 락 등)은 영속 store 선정과 함께 **TBD(추후 측정)** — 현 단계에 DB는 도입하지 않으며(ADR-000) M2+에서 PostgreSQL 등 PRD 권장 스택으로 확정한다.
- 큐 전달은 **at-least-once**를 가정한다. 따라서 컨슈머(작업 처리기)는 **재전달에 안전(de-dup safe)** 해야 하며, 이미 terminal이거나 진행 중인 작업의 재전달은 부수효과(특히 과금·외부 호출) 없이 무시·합류한다.
- 이미 정의된 `GeneratePptxInput.idempotencyKey?`는 이 모델의 PPTX 생성 단계 접점으로 사용한다(상위 작업 key의 전파 또는 파생).

### D4. 책임 경계 (provider interface 우선)

- 상태 전이·idempotency 강제는 **Application Use Case** 계층의 책임으로 둔다. 도메인은 상태/전이 표/불변식을 **순수 타입·함수**로 제공한다.
- 큐잉·영속화·객체 저장은 `JobQueueProvider` / `ObjectStorageProvider`(및 추후 정의될 job store)의 메서드로 추상화한다. 이 메서드 시그니처(`enqueue`/`process`, `put`/`get`/`signedUrl` 등)는 인터페이스 주석상 **M2에서 정의** 예정이며, 본 ADR은 그 시그니처가 D1–D3을 만족하도록 제약을 건다.

---

## Constraints

- **빅뱅 금지 / Milestone 1 우선 증명**(ADR-000): 본 ADR은 코드 변경을 수반하지 않는다. 웹 프레임워크·DB·큐 인프라는 M2에서 도입한다.
- **레이어 규칙**: Domain(`@worship-score/core`)은 외부 엔진/SDK/큐/DB를 직접 import하지 않는다. 상태 머신의 순수 부분만 Domain에, 실행은 Infrastructure에 둔다.
- **TypeScript strict**(NodeNext ESM, `noUncheckedIndexedAccess` 등) 및 zod 스키마 기반 검증 관행을 유지한다(상태/이벤트/전이는 zod로 표현 가능해야 한다).
- **실행 환경**: Windows 11, Node v22.21.0, pnpm 11.5.2. Java 없음(OMR은 M3로 본 ADR 무관).

---

## Consequences

### Positive

- 클라이언트가 상태를 위조할 수 없으므로 산출물·과금 무결성의 단일 권위 지점이 생긴다.
- at-least-once 큐 가정 하에서도 중복 실행/중복 과금이 구조적으로 차단된다.
- 도메인에 순수 상태 머신을 두므로 전이 규칙을 property test로 강화하기 쉽다(M4의 property test 강화 방향과 정합).
- 이미 존재하는 `JobQueueProvider`/`ObjectStorageProvider`/`idempotencyKey?` 접점과 충돌 없이 M2 구현이 진입할 수 있다.

### Negative / Risks

- idempotency 원자성은 영속 store의 동시성 보장에 의존한다. store 미선정 상태에서는 원자성 메커니즘을 확정할 수 없다(**TBD**). 잘못 구현 시 경합에서 중복 작업이 생성될 수 있다.
- key 산출 방식 미확정으로, 입력 해시 기반을 택할 경우 "의도적으로 동일 입력을 재처리하고 싶은" 사용자 시나리오(예: 설정만 바꾼 재생성)와 충돌할 수 있다 — key 정의 시 함께 해소해야 한다.
- 상태 라벨 세분도가 PRD §11 확정 라벨에 맞춰질 때까지 하위 단계 이름은 잠정값이다.

### Neutral

- 재처리를 "새 작업/새 revision"으로 모델링하는 결정은 M4의 immutable revision 방향과 함께 재검토될 수 있다(상호 보완적).

---

## Alternatives Considered

- **클라이언트 주도 상태 전이** — 클라이언트가 상태/전이를 직접 보내는 방식.
  - *Rejected*: 과금·산출물 무결성을 클라이언트에 위임하게 되어 위·변조에 노출. D1(서버 측 전이)로 거부.
- **Idempotency 미적용, 큐 exactly-once 가정** — 큐가 정확히 1회 전달한다고 신뢰.
  - *Rejected*: 실무 큐는 일반적으로 at-least-once이며, 업로드 재시도/더블클릭 등 큐 외부의 중복 경로도 존재. 비용 발생 단계(OMR, AI 검증)에서 금전 손실 위험.
- **상태 머신을 Infrastructure에만 두기** — 전이 규칙을 어댑터/DB 트리거에 직접 구현.
  - *Rejected*: 레이어 규칙 위반 및 테스트 난이도 증가. 순수 전이 규칙은 Domain에, 실행은 Infrastructure에 분리(D4).

---

## Open Questions (TBD — 추후 측정/확정)

1. PRD §11의 정확한 상태 라벨 집합과 `failed*` 세분도 — M2 설계 시 확정.
2. Idempotency key 산출 방식(클라이언트 제공 / 입력 콘텐츠 해시 / 결합) 및 충돌 정책.
3. Idempotency 원자성 메커니즘과 영속 store 선정(PostgreSQL 등 PRD 권장 스택, M2+).
4. retry 정책(최대 횟수, 백오프, 어떤 `failed*`가 재시도 가능한지) — 본 ADR 범위 밖, M2에서 별도 결정.
5. 상위 작업 key와 `GeneratePptxInput.idempotencyKey?`의 전파/파생 규칙.

---

## Notes

- 본 ADR은 **방향 확정**이며 구현을 포함하지 않는다. 구현은 Milestone 2(업로드/작업 파이프라인: 파일 업로드·권리확인·MIME 검사·객체 저장·입력 품질·job state machine·idempotency·retry)에서 수행한다.
- 확정되지 않은 모든 수치·라벨·메커니즘은 'TBD(추후 측정)'로 표기했으며, M2 착수 시 본 문서를 갱신한다.
