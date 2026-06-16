# ADR-010: 제3자 라이선스 게이트 (Third-Party License Gate)

- 상태(Status): 채택(Accepted)
- 날짜(Date): 2026-06-16
- 결정자(Deciders): WorshipScore AI 구현팀
- 관련 ADR: ADR-000(스택 채택 / "빅뱅 금지 / Milestone 1 우선 증명")
- 연계 문서: `THIRD_PARTY_LICENSE_REVIEW.md`

## 컨텍스트(Context)

WorshipScore AI는 찬양 악보 이미지/PDF를 구조화된 악보 데이터(ScoreIR)로 변환하고, 오선·멜로디·리듬·가사가 포함된 16:9 PPTX를 새로 조판·생성하는 **상업용(commercial) SaaS**이다. 상업적 배포는 비상업·학술 코드와 달리 제3자 의존성의 라이선스 의무를 직접적으로 발생시키며, 특히 copyleft 라이선스(GPL/AGPL 계열)의 전파 조건은 소스 공개·배포 의무로 이어질 수 있어 제품 가치와 충돌할 위험이 있다.

현재(Milestone 1) 의존성은 다음과 같으며, 버전과 SPDX 식별자가 확정되어 있다.

| 패키지 | 버전 | SPDX | 비고 |
| --- | --- | --- | --- |
| verovio | 6.2.0 | LGPL-3.0-or-later | MusicXML→SVG 렌더. WASM 형태로 사용 |
| @resvg/resvg-js | 2.6.2 | MPL-2.0 | SVG→PNG |
| pptxgenjs | 4.0.1 | MIT | PPTX 빌더 |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) → **MIT 선택** | OOXML 검증용 ZIP 처리 |
| fast-xml-parser | 5.8.0 | MIT | OOXML XML 파싱 |
| zod | 3.25.76 | MIT | 스키마 |
| tsx | 4.22.4 | MIT | 런타임 실행(개발) |
| vitest | 2.1.9 | MIT | 테스트(개발) |
| typescript | 5.9.3 | Apache-2.0 | 타입체크(개발) |

추가로, OMR(광학 악보 인식)을 다룰 Milestone 3에서 후보로 거론되는 **Audiveris는 AGPL-3.0**이다. AGPL-3.0은 네트워크를 통한 서비스 제공(SaaS) 시에도 소스 제공 의무를 발생시키는 강한 copyleft로, 본 제품의 상업 모델에 직접적인 영향을 줄 수 있다. 현재 Audiveris는 의존성에 추가되어 있지 않으며, 실행 환경에 Java가 없어 Audiveris/MuseScore CLI 구동도 현 단계에서는 불가능하다(현 단계 기능과는 무관). 따라서 라이선스 의사결정을 코드 도입보다 **앞서** 게이트로 고정해 둘 필요가 있다.

이 ADR이 다루는 핵심 문제는 두 가지다.

1. 상업 출시 시점에 의존성 라이선스 의무를 누락 없이 식별·승인했음을 어떻게 보장할 것인가.
2. AGPL-3.0(특히 Audiveris)을 우발적으로 프로덕션 경로에 끌어들이는 것을 어떻게 구조적으로 차단할 것인가.

## 결정(Decision)

다음을 라이선스 게이트(license gate)로 채택한다.

### 1. 상업 출시 전 SBOM/라이선스 승인 필수

상업 출시(production launch) 이전에 SBOM(Software Bill of Materials) 생성과 전체 의존성 라이선스 검토·승인을 **필수 게이트**로 둔다. 승인 기록의 단일 출처(single source of truth)는 `THIRD_PARTY_LICENSE_REVIEW.md`이며, 각 의존성에 대해 다음을 명시한다.

- 패키지명, 정확한 버전, 확정 SPDX 식별자
- 사용 형태(런타임/개발용, 링크 방식, 배포 여부)
- 의무 사항(고지문 포함 여부, 소스 제공 의무 여부 등)과 충족 방법
- 승인 여부와 승인 근거

`THIRD_PARTY_LICENSE_REVIEW.md`에 승인 기록이 없는 라이선스 의무를 가진 의존성은 프로덕션 빌드에 포함될 수 없다.

### 2. Audiveris(AGPL-3.0)는 법무 승인 전 프로덕션 경로 금지

Audiveris(AGPL-3.0)는 **법무(legal) 승인 이전에는 어떤 프로덕션 경로에도 포함하지 않는다.** 이는 Milestone 3의 OMR 기술검증 단계에서도 동일하게 적용되며, spike/실험 코드라 하더라도 프로덕션 산출물 또는 SaaS 런타임에 도달하는 경로로 병합되어서는 안 된다. 기술검증은 격리된 환경에서 수행하되, 그 결과가 곧 도입 승인을 의미하지 않는다.

### 3. "별도 worker 분리 = 의무 자동 해소" 가정 금지

Audiveris를 별도 프로세스/별도 worker/별도 서비스로 분리(out-of-process isolation)하면 AGPL-3.0 의무가 **자동으로 해소된다고 가정하지 않는다.** 프로세스 경계는 라이선스 경계를 보장하지 않으며, 네트워크 상호작용 형태·결합 정도·배포 구조에 따라 의무가 여전히 발생할 수 있다. 분리 아키텍처가 의무를 충족·완화하는지는 **법무 검토를 통해서만** 판정하며, 아키텍처상의 분리 자체를 면책 근거로 사용하지 않는다.

### 4. 적용 시점(Scope of enforcement)

- Milestone 1~M8(상업화 직전까지): 의존성 추가 시 SPDX 확정·기록을 유지한다. copyleft(GPL/AGPL 계열) 신규 의존성은 도입 검토 단계에서 본 게이트를 트리거한다.
- Milestone 9(상업화): SBOM 생성, 라이선스 승인 완료, 라이선스 게이트 통과를 출시 차단 조건(release-blocking)으로 삼는다.

## 근거(Rationale)

- **상업 SaaS는 라이선스 의무의 주체가 된다.** 비공개 배포라도 고지 의무·소스 제공 의무가 면제되지 않으며, AGPL은 SaaS 제공 그 자체를 배포 유사 행위로 다룰 수 있다. 따라서 의무 식별은 출시의 전제 조건이다.
- **게이트를 코드보다 앞에 둔다.** Audiveris는 아직 의존성에 없고 Java 부재로 실행도 불가하므로, 지금이 우발적 도입을 구조적으로 차단하기에 가장 비용이 낮은 시점이다. "빅뱅 금지" 원칙(ADR-000)과 일관되게, 리스크가 큰 결정은 작고 명시적인 게이트로 선제 고정한다.
- **프로세스 분리에 대한 보수적 입장.** 분리만으로 copyleft 의무가 사라진다는 통념은 결합 형태에 따라 성립하지 않을 수 있다. 잘못된 면책 가정은 출시 후 회복 비용이 매우 크므로, 판정을 법무에 위임하는 보수적 기본값을 택한다.
- **현재 의존성 스택은 우호적이다.** MIT/Apache-2.0/MPL-2.0/LGPL이 주를 이루며, jszip의 듀얼 라이선스는 MIT를 선택했다. 다만 LGPL-3.0-or-later(verovio)·MPL-2.0(@resvg/resvg-js)도 고지·소스 제공 관련 조건이 있으므로 검토 대상에서 제외하지 않는다.

## 결과(Consequences)

### 긍정적(Positive)

- 상업 출시 시 라이선스 의무 누락 위험을 게이트로 차단한다.
- AGPL 전파 리스크를 도입 이전 단계에서 구조적으로 봉쇄한다.
- 의존성 결정의 근거가 `THIRD_PARTY_LICENSE_REVIEW.md`에 추적 가능한 형태로 남는다.

### 부정적/비용(Negative / Cost)

- OMR 엔진 선택지가 좁아질 수 있다(법무 승인 전까지 Audiveris 제외). 대안 엔진 spike와 골든셋 측정이 Milestone 3에서 필요하다.
- 상업 출시 전 SBOM 생성·법무 검토라는 추가 절차가 발생한다.

### 후속 작업(Follow-ups)

- `THIRD_PARTY_LICENSE_REVIEW.md`를 현재 확정 의존성(위 표) 기준으로 작성·유지한다.
- SBOM 생성 도구/형식(예: CycloneDX/SPDX) 선정: TBD(추후 측정).
- 라이선스 게이트의 CI 자동화 방식(의존성 라이선스 스캔·차단): TBD(추후 측정).
- Audiveris 대안 OMR 후보 목록 및 라이선스 적합성 평가: Milestone 3에서 수행, 결과 TBD(추후 측정).
- 분리 아키텍처에 대한 법무 판정 기준 문서화: TBD(추후 측정).

## 비고(Notes)

- 본 ADR은 법률 자문이 아니며, 최종 라이선스 적합성 판정은 법무 검토를 통해 확정한다.
- 개발 전용 의존성(tsx/vitest/typescript)은 배포 산출물에 포함되지 않으나, SBOM 및 검토 범위에서 누락하지 않고 명시적으로 "개발용·미배포"로 기록한다.
