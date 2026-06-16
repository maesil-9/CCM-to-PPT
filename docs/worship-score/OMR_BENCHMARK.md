# OMR_BENCHMARK.md

> 상태: **OMR 미착수 (Milestone 3 / PRD Phase 1)**. 본 문서는 Milestone 1(결정적 출력 체인) 증명 직후 작성된 **벤치마크 방법론 틀**이다. 후보 엔진 선정·실측 수치는 아직 존재하지 않으며, 모든 측정값은 `TBD(추후 측정)`으로 표기한다.

## 0. 문서 목적과 범위

본 문서는 PRD 구현프롬프트 §8 Milestone 3("OMR 기술 검증")의 산출물이다. 목적은 다음 두 가지다.

1. 특정 OMR 엔진을 **핵심 경로에 고정하기 전에** 거쳐야 할 벤치마크 절차·지표·종료 조건을 사전에 정의한다.
2. 측정 결과가 확보되면 본 문서가 그대로 채워져 "프로덕션 OMR 방향 결정 또는 보류 근거"의 1차 기록이 된다.

**비범위(Non-goals).** 본 단계에서 OMR 엔진을 프로덕션 의존성으로 추가하지 않는다. LLM 비전 모델로 음표 단위 OMR을 대체하지 않는다(그럴듯하지만 틀린 결과 위험). 자동 OMR 정확도는 고객 약속이 아니라 내부 평가 지표로만 사용한다.

## 1. 현재 상태 (Milestone 1 기준)

Milestone 1에서 OMR을 제외한 결정적 출력 체인이 실측·검증되었다. 즉 입력 ScoreIR이 주어졌을 때의 다운스트림은 이미 동작한다.

- 체인: `ScoreIR → zod schema → validateScore → MusicXML 4.0 → Verovio(SVG+PNG) → slide plan → PptxGenJS PPTX → OOXML 검증 → preview(PNG)`.
- OMR은 이 체인의 **상류(upstream)** 에 해당하며, 그 출력 계약은 동일한 `ScoreIR`(`SCOREIR_SCHEMA_VERSION = 'scoreir-0.1.0'`)이다. 따라서 벤치마크의 본질은 "후보 엔진이 골든 이미지/PDF로부터 정답 ScoreIR에 얼마나 근접한 ScoreIR을 산출하는가"를 측정하는 것으로 환원된다.

### 1.1 provider interface 현황

`@worship-score/core`의 `packages/core/src/types/providers.ts`에 `OMRProvider` 인터페이스가 이미 정의되어 있으나, Milestone 1 시점에는 **인식 메서드를 의도적으로 보류**한 최소형이다.

```ts
// packages/core/src/types/providers.ts (현재, M1)
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

Milestone 3에서 PRD §8이 규정한 전체 시그니처로 확장한다(인터페이스는 Domain 계약이며, 후보 엔진 구현은 `@worship-score/adapters`에 둔다 — Domain은 외부 엔진을 직접 import하지 않는다).

```ts
// PRD §8 — Milestone 3에서 확장 예정
export interface OMRProvider {
  readonly providerName: string;
  readonly providerVersion: string;
  inspectCapabilities(): Promise<OMRCapabilities>;
  recognize(input: OMRInput): Promise<OMRResult>;
  recognizeRegion(input: OMRRegionInput): Promise<OMRRegionResult>;
  healthCheck(): Promise<ProviderHealth>;
}
```

## 2. 후보 엔진 (Candidates)

PRD는 OMR 후보 엔진 **2개 이상 비교**를 요구한다(Phase 0 목표). 본 벤치마크는 다음 세 범주를 다룬다.

| 범주 | 엔진 | 라이선스 | 게이트/주의 |
|---|---|---|---|
| 오픈소스 | Audiveris (github.com/Audiveris/audiveris) | **AGPL-3.0** | **법무 승인 전 프로덕션 경로 금지.** 별도 프로세스/어댑터 분리만으로 AGPL 의무가 자동 해소된다고 가정하지 않는다. 기술 검증용 사용도 배포·네트워크 사용 조건을 검토한다. |
| 상용 | TBD(추후 측정) | TBD | 가격·이용약관·데이터 처리 조건 검토 필요. |
| 자체/대체 | 커스텀 OMR 대체 가능성 유지 | TBD | 후보 부적합 시 직접 구현 경로를 옵션으로 남긴다. |

> **실행 환경 제약.** 현재 머신에 **Java가 설치되어 있지 않다** → Audiveris CLI 직접 실행 불가. M3 spike 시 별도 컨테이너/워커 환경(JVM 포함)을 구성한다(PRD: Python 또는 독립 컨테이너 OMR worker). 본 제약은 Milestone 1 범위와 무관하다.

### 2.1 mock-first 원칙

후보 엔진 통합 전에 **`MockOmrProvider`를 먼저 구현**한다. mock은 골든셋의 정답 ScoreIR을 (옵션으로 잡음을 주입하여) 반환함으로써, 채점 하네스·집계 리포트·회귀 파이프라인을 엔진 없이 먼저 검증한다. 이로써 "벤치마크 코드 자체의 버그"와 "엔진 품질"을 분리한다.

## 3. 골든 데이터셋 (Golden Dataset)

**권리가 명확한 악보만** 사용한다. 구성은 PRD §17.1 권장 최소 구성을 따른다.

| 유형 | 권장 최소 수량 |
|---|---:|
| 깨끗한 디지털 단선율 | 300 페이지 |
| 스캔 | 150 페이지 |
| 모바일 촬영 | 50 페이지 |
| 여러 절 가사 | 150 곡 |
| 반복 기호 | 100 곡 |
| 코드 포함 원본 | 150 곡 |
| 박자표 3/4, 4/4, 6/8 | 각 충분한 표본 |
| 의도적 실패 | 100 페이지 |

> 현재 확보 수량: **TBD(추후 측정)**. Phase 0 종료 조건은 "권리가 명확한 샘플 30곡 이상 처리"이므로, 초기 spike는 깨끗한 디지털 단선율 부분집합으로 시작한다. Milestone 1의 합성 fixture(`packages/pipeline/src/fixtures/cleanDigitalSample.ts`: C major, 4/4, 8마디, 2절, verse+chorus, 반복, tie 1개)는 다운스트림 검증용이며, OMR 입력(이미지/PDF) 골든셋과는 별개다.

### 3.1 정답 데이터(Ground Truth)

각 샘플은 PRD §17.2에 따라 다음 정답을 동반한다. 채점은 엔진 출력 ScoreIR을 이 정답과 대조한다.

- ScoreIR (정답)
- MusicXML
- 요소 좌표(`SourceRegion`)
- 음높이 / 음가
- 가사 음절 / 가사-음표 연결
- 반복 구조
- 예상 슬라이드 계획(`planPresentation()` 기대 출력)
- 지원/비지원 판정(엔진·파이프라인이 처리 대상으로 인정하는지)

## 4. 측정 지표 (Metrics)

모든 수치는 측정 전이므로 `TBD(추후 측정)`이다. 지표는 **유형별(§3 데이터셋 카테고리별)로 분해**하여 보고한다 — 입력 품질·악보 종류에 따라 OMR 성능 편차가 크기 때문이다(PRD 가정).

### 4.1 정확도 지표

| 지표 | 정의(측정 단위) | 목표 | 현재값 |
|---|---|---|---|
| 음높이 정확도 (Pitch accuracy) | 정답 대비 올바른 `Pitch`를 가진 음표 비율 | TBD | TBD(추후 측정) |
| 음가 정확도 (Duration accuracy) | 정답 대비 올바른 `Duration`(divisions 기준)을 가진 이벤트 비율 | TBD | TBD(추후 측정) |
| 가사 정확도 (Lyric accuracy) | 음절 텍스트 + 가사-음표 연결의 정확 비율 | TBD | TBD(추후 측정) |
| 반복 구조 정확도 | 반복/절 구조 식별 정확도 | TBD | TBD(추후 측정) |
| 마디 정렬률 | 정답 마디와 1:1 정렬된 마디 비율 | TBD | TBD(추후 측정) |

> 정렬·집계 방법론(노트 정렬 알고리즘, 부분 일치 처리, 음높이 이명동음 처리 등)은 mock-first 단계에서 확정한다. 현재는 `TBD(추후 측정)`.

### 4.2 고위험 오류 검출률 (High-risk error detection)

"그럴듯하지만 틀린" 결과가 검수자에게 그대로 전달되는 것을 막는 것이 핵심이다. 따라서 정확도뿐 아니라 **엔진/검증기가 자신의 오류를 불확실로 표시했는지**를 별도 측정한다.

| 지표 | 정의 | 현재값 |
|---|---|---|
| 고위험 오류 검출률 | 실제 오류 중 `ScoreUncertainty`로 표시되었거나 `validateScore()`가 blocking으로 잡아낸 비율(재현율) | TBD(추후 측정) |
| 무신호 치명 오류율 (silent critical) | 정답과 다르나 불확실 표시도 검증 위반도 없는 음표 비율 (낮을수록 좋음) | TBD(추후 측정) |
| 검증기 연계 | `validateScore()`(12개 규칙, severity `info|warning|error|fatal`)가 OMR 산출 ScoreIR에서 잡는 blocking/warning 수 | TBD(추후 측정) |

### 4.3 비용 · 처리시간

| 지표 | 단위 | 현재값 |
|---|---|---|
| 페이지당 비용 | 통화/페이지 (라이선스·인프라 포함) | TBD(추후 측정) |
| 페이지당 처리시간 | 초/페이지 (단일 패스) | TBD(추후 측정) |
| 다중 패스 추가 비용/시간 | 불확실 마디 확대 재인식(시스템 단위 → 마디 확대) 오버헤드 | TBD(추후 측정) |
| 실행 환경 | CPU/메모리/JVM 등 | TBD(추후 측정) |

### 4.4 실패 유형 분류 (Failure taxonomy)

Phase 0 종료 조건은 "가장 큰 실패 유형이 수치로 확인됨"이다. 실패는 다음 범주로 라벨링하고 빈도를 집계한다(범주는 측정 중 확장 가능).

| 실패 유형 | 설명 | 빈도 |
|---|---|---:|
| 페이지 구조 인식 실패 | 시스템/스태프 분할 오류 | TBD(추후 측정) |
| 음높이 오인식 | 선·간 오독, 임시표/조표 오적용 | TBD(추후 측정) |
| 음가 오인식 | 부점·연음(tie)·잇단음표 오독 | TBD(추후 측정) |
| 가사 OCR 실패 | 음절 누락·오인식·연결 오류(특히 한글) | TBD(추후 측정) |
| 반복/구조 오인식 | 반복 기호·절 경계 오독 | TBD(추후 측정) |
| 처리 거부/크래시 | 엔진 예외·타임아웃 | TBD(추후 측정) |

## 5. 벤치마크 절차 (Procedure)

1. **하네스 구성.** mock provider로 채점·집계·리포트 파이프라인을 먼저 검증한다(§2.1).
2. **격리 실행 환경.** 후보 엔진별 컨테이너/워커(필요 시 JVM)에서 spike. AGPL 엔진은 격리 + 법무 검토 전제하에 **기술 검증 한정**.
3. **인식 → ScoreIR 매핑.** 엔진 native 출력(예: MusicXML)을 `ScoreIR`로 변환하는 어댑터를 `@worship-score/adapters`에 둔다.
4. **다운스트림 재사용.** 산출 ScoreIR을 기존 결정적 체인(`validateScore → MusicXML → Verovio → slide plan → PPTX`)에 그대로 흘려, 검증·렌더 단계까지의 영향을 함께 관측한다.
5. **채점.** §4 지표를 데이터셋 유형별로 산출한다.
6. **회귀 등록.** PRD §17.3에 따라 OMR 엔진·OCR·모델·프롬프트·스키마·변환·렌더러·빌더·레이아웃 규칙 변경 시 전체 평가를 재실행한다.

## 6. 종료 조건 (Exit Criteria)

Milestone 3 / Phase 0 벤치마크는 다음을 모두 충족할 때 종료한다(PRD Phase 0 종료 조건 + §8 Milestone 3 산출물).

- [ ] 권리가 명확한 샘플 **30곡 이상** 처리 — 현재: TBD(추후 측정)
- [ ] 후보 엔진 **2개 이상** 비교(§2) — 현재: TBD(추후 측정)
- [ ] 깨끗한 단선율에서 OMR→ScoreIR→PPTX 전체 파이프라인 작동 확인 — 현재: TBD(추후 측정)
- [ ] §4 지표(정확도·고위험 검출·비용·시간·실패 유형) 수치화 — 현재: TBD(추후 측정)
- [ ] **가장 큰 실패 유형이 수치로 확인됨** — 현재: TBD(추후 측정)
- [ ] **프로덕션 OMR 방향 결정 또는 보류 근거 작성** — 현재: 미작성(엔진 미선정)
- [ ] Audiveris 채택 검토 시 **법무 승인** 획득 여부 명시 — 현재: 미요청

> 벤치마크 없이 특정 엔진을 핵심 경로에 고정하지 않는다. 본 종료 조건이 충족되기 전까지 OMR은 프로덕션 경로 밖에 둔다.

## 7. 라이선스 게이트 (License Gate)

| 항목 | 결정 |
|---|---|
| Audiveris (AGPL-3.0) | 의존성 미추가. **법무 승인 전 프로덕션 경로 금지.** 기술 검증용 사용도 배포·네트워크 사용 조건 검토. 프로세스/어댑터 분리로 의무가 자동 해소된다고 가정하지 않음. |
| 상용 엔진 | 약관·데이터 처리·재배포 조건 검토 후 결정 — TBD. |
| 대체 경로 | 커스텀 OMR 구현 가능성을 옵션으로 유지. |

런타임 AI나 어댑터가 OMR 엔진·MusicXML 생성기·렌더러·PPTX 엔진을 **대체하도록 설계하지 않는다**(PRD 원칙). OMR은 ScoreIR 후보를 제공하고, 구조 검증과 검수 UI가 이를 보정한다.

## 8. 결과 기록 (To Be Filled)

> 본 절은 측정 완료 후 채운다. 현재 모든 항목 `TBD(추후 측정)`.

- 비교 표(엔진 × 데이터셋 유형 × §4 지표): TBD
- 권장 엔진 또는 보류 결정 + 근거: TBD
- 법무 검토 결과(Audiveris 등): TBD
- 추적 정보(엔진·버전·환경): TBD

## 부록 A. 참조

- PRD §8 Milestone 3 — OMR 기술 검증 / `/docs/worship-score/OMR_BENCHMARK.md`
- PRD §9.3 OMR 및 OCR (OMR-001~005: 페이지 구조·음악 요소·가사·코드 레이어·다중 패스)
- PRD §17 평가 데이터셋(골든셋 구성·정답 데이터·회귀 트리거)
- PRD §20.2 Audiveris 라이선스 원칙(AGPL-3.0)
- ADR-002 OMR provider abstraction
- 코드: `packages/core/src/types/providers.ts`(`OMRProvider`, `OMRCapabilities`)
