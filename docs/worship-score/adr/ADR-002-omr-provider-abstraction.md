# ADR-002: OMR Provider 추상화

- **Status**: Accepted
- **Date**: 2026-06-16
- **Deciders**: WorshipScore AI 구현 에이전트
- **Related**: ADR-000 (채택 스택 / 빅뱅 금지 원칙), Milestone 3 (OMR 기술검증)
- **Supersedes**: 없음

---

## Context

WorshipScore AI의 핵심 입력은 찬양 악보 이미지/PDF이며, 이를 구조화된 `ScoreIR`로 변환하는 단계가 제품 가치의 출발점이다. 이 변환은 **OMR(Optical Music Recognition)**에 의존한다. 그러나 OMR은 다음과 같은 본질적 불확실성을 안고 있다.

1. **엔진 선택이 아직 검증되지 않음.** 후보 OMR 엔진(예: Audiveris 등)의 품질·비용·처리시간은 본 저장소에서 아직 측정되지 않았다. 현 단계의 측정값은 모두 TBD(추후 측정)이다.
2. **실행 환경 제약.** 현재 머신에는 Java가 설치되어 있지 않아 Audiveris/MuseScore CLI를 직접 실행할 수 없다. 따라서 어떤 엔진도 "지금 당장 동작하는 기본값"으로 고정할 수 없다.
3. **라이선스 리스크.** 유력 후보인 Audiveris는 AGPL-3.0이며, 별도 worker 프로세스로 분리한다고 해서 AGPL 의무가 자동으로 해소된다고 가정할 수 없다. 법무 승인 전에는 프로덕션 경로에 진입시키지 않는다.
4. **아키텍처 경계 원칙.** 채택된 레이어 구조(UI → Application Use Cases → Domain → Provider Interfaces → Infrastructure Adapters)에서 Domain은 외부 엔진/SDK를 직접 import하지 않는다. OMR 엔진은 전형적인 외부 인프라 의존성이며, Domain이 특정 엔진에 결합되어서는 안 된다.

ADR-000의 "빅뱅 금지 / Milestone 1 우선 증명" 원칙에 따라, Milestone 1에서는 OMR을 **구현하지 않고** 결정적 변환 체인(`ScoreIR → MusicXML → Verovio → PptxGenJS → OOXML 검증`)을 먼저 실증했다. 이 시점에서 우리가 내려야 하는 결정은 "어떤 OMR 엔진을 쓸 것인가"가 아니라, **"OMR 엔진을 어떻게 도메인으로부터 분리해 둘 것인가"**이다.

---

## Decision

OMR 기능을 **`OMRProvider` provider interface**로 추상화하고, 다음 규칙을 ADR로 확정한다.

1. **인터페이스 우선, 구현은 M3.**
   `OMRProvider`를 `packages/core` (`@worship-score/core`)의 `src/types/providers.ts`에 인터페이스로 정의한다. 실제 인식 메서드(`recognize`, `recognizeRegion`)와 어댑터 구현은 Milestone 3에서 도입한다. 현 단계에서는 forward-compat 인터페이스만 선언한다.

2. **Domain은 OMR 엔진을 직접 import 금지.**
   `@worship-score/core`(Domain)는 어떤 OMR 엔진/SDK도 직접 import하지 않는다. Domain은 오직 `OMRProvider` 인터페이스에만 의존하며, 구체 엔진은 Infrastructure Adapters(`packages/adapters`)에서 인터페이스를 구현(`implements OMRProvider`)하는 방식으로만 연결된다. 이는 Verovio/PptxGenJS 어댑터가 각각 `RendererProvider`/`PptxBuilder`를 구현하는 것과 동일한 패턴이다.

3. **벤치마크 전 특정 엔진 고정 금지.**
   품질/비용/시간에 대한 골든셋 기반 측정(Milestone 3 spike)이 완료되기 전까지, 어떤 OMR 엔진도 기본 provider로 고정하지 않는다. 인터페이스는 복수 후보 엔진을 동등하게 교체 가능한 형태로 유지한다.

4. **라이선스 게이트.**
   Audiveris(AGPL-3.0)는 현재 의존성에 추가하지 않는다. 법무 승인 전에는 프로덕션 경로에 포함하지 않으며, "worker 분리로 AGPL 의무가 자동 해소된다"는 가정을 두지 않는다. 이 게이트는 Milestone 3의 명시적 선결 조건이다.

### 현재 정의된 인터페이스 (확정, `core/src/types/providers.ts`)

현 시점에 실제로 선언되어 있는 형태는 다음과 같다. 식별 정보와 capability 점검, health check만을 노출하며, 실제 인식 메서드는 주석으로 M3 도입을 명시한다.

```ts
export interface OMRCapabilities {
  supportsHandwriting: boolean;
  supportsPolyphony: boolean;
  maxStaves: number;
}

export interface OMRProvider {
  readonly providerName: string;
  readonly providerVersion: string;
  inspectCapabilities(): Promise<OMRCapabilities>;
  // recognize(...) and recognizeRegion(...) are defined in Milestone 3.
  healthCheck(): Promise<ProviderHealth>;
}
```

이 인터페이스는 의도적으로 최소한이다. 인식 입출력 계약(입력 이미지/영역 표현, 반환되는 `ScoreIR` 단편, evidence/uncertainty 표현 등)은 골든셋과 실제 엔진 출력 특성을 보고 나서 확정해야 하므로, 벤치마크 이전에 과도하게 박제하지 않는다. 인식 메서드의 상세 시그니처는 **TBD(추후 측정·설계, Milestone 3)**이다.

---

## Consequences

### 긍정적

- **엔진 교체 가능성 확보.** Domain과 Application Use Cases는 `OMRProvider`에만 의존하므로, M3 벤치마크 결과에 따라 특정 엔진을 채택/교체/병행해도 도메인 코드 변경이 발생하지 않는다.
- **빅뱅 회피.** 인터페이스만 먼저 선언하므로 Milestone 1 결정적 체인을 OMR 도입 없이 완성·검증할 수 있었다(체인 실증 완료).
- **라이선스 폭발 차단.** AGPL 엔진을 의존성에 넣지 않은 채로 인터페이스를 정의함으로써, 법무 승인 전까지 코드베이스가 AGPL 전염 리스크에 노출되지 않는다.
- **테스트 용이성.** 인터페이스 기반이므로 M3 이전에도 mock provider로 Application 레이어를 단위 테스트할 수 있다(M3 범위에 mock 명시).

### 부정적 / 트레이드오프

- **인식 계약 미확정.** `recognize`/`recognizeRegion`의 입출력이 아직 정의되지 않아, OMR 결과를 소비하는 Use Case는 M3 전까지 구현 불가능하다. 이는 의도된 지연이다.
- **선택 비용의 이연.** "어떤 엔진이 최적인가"라는 핵심 리스크가 M3로 이연된다. 측정 전까지 품질/비용/시간은 모두 TBD(추후 측정)이며, 이 불확실성은 일정 리스크로 남는다.
- **추상화 누수 가능성.** 실제 엔진 출력 특성(좌표계, 신뢰도 표현, 부분 인식 실패 모드 등)이 현재 인터페이스 가정과 어긋날 경우, M3에서 인터페이스를 한 차례 재설계해야 할 수 있다. 인터페이스를 최소로 유지한 것은 이 재설계 비용을 줄이기 위함이다.

### 후속 작업 (Milestone 3, 확정 범위)

- provider interface 확정(인식 메서드 시그니처 포함), mock provider 구현.
- 후보 엔진 spike, 골든셋 구축, 품질/비용/시간 측정(현재 모두 TBD).
- Audiveris AGPL 라이선스 게이트(법무 승인) 통과 여부 결정.

---

## Alternatives Considered

### A. 단일 OMR 엔진을 지금 직접 채택해 Domain/파이프라인에 결합

- **기각 사유**: 벤치마크가 없어 최적 엔진을 알 수 없고, 현재 머신에 Java가 없어 유력 후보(Audiveris/MuseScore CLI)를 실행조차 할 수 없다. ADR-000의 "빅뱅 금지" 원칙에도 정면으로 배치된다.

### B. 인터페이스 없이 M3에 가서 처음부터 설계

- **기각 사유**: 다른 provider(`RendererProvider`, `PptxBuilder`, `VisionReviewProvider` 등)와 일관된 경계를 지금 선언해 두는 편이 레이어 규칙(Domain은 외부 엔진 직접 import 금지)을 코드 수준에서 강제하기에 유리하다. 인터페이스 선언 비용은 낮고, 경계 명시 이득은 크다.

### C. 인식 입출력까지 포함한 완전한 인터페이스를 지금 확정

- **기각 사유**: 실제 엔진 출력 특성을 모르는 상태에서 인식 계약을 박제하면 M3에서 높은 확률로 재설계가 발생한다. capability/health 점검 수준의 최소 표면만 노출하고 인식 계약은 측정 후 확정한다(TBD).

### D. Audiveris를 별도 worker로 분리하면 AGPL 문제가 해소된다고 가정하고 진행

- **기각 사유**: worker 분리가 AGPL 의무를 자동 해소한다고 단정할 수 없다. 법무 승인 전 프로덕션 경로 진입을 금지하는 보수적 게이트를 유지한다.

---

## Compliance Notes

- **Layer 규칙**: `@worship-score/core`는 OMR 엔진을 import하지 않으며 `OMRProvider` 인터페이스만 보유한다. 구체 구현은 `@worship-score/adapters`로 격리된다.
- **라이선스**: 현재 의존성 트리에 OMR 엔진은 포함되지 않는다. Audiveris(AGPL-3.0)는 법무 승인 전 추가 금지.
- **측정값**: 엔진별 품질/비용/처리시간 및 인식 메서드 최종 시그니처는 모두 **TBD(추후 측정, Milestone 3)**.
