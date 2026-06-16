# ADR-001: ScoreIR와 MusicXML의 분리

- 상태(Status): Accepted
- 일자(Date): 2026-06-16
- 결정자(Deciders): WorshipScore AI 구현 에이전트
- 관련(Related): ADR-000(스택 채택, "빅뱅 금지 / Milestone 1 우선 증명")
- 영향 범위(Affected packages): `@worship-score/core`, `@worship-score/adapters`, `@worship-score/pipeline`

## Context (배경)

WorshipScore AI는 찬양 악보 이미지/PDF를 구조화된 악보 데이터로 변환하고, 이를 근거로 오선·멜로디·리듬·가사가 포함된 예배용 16:9 PPTX를 새로 조판·생성하는 상업용 SaaS다. 이 파이프라인은 두 가지 본질적으로 다른 요구를 동시에 만족해야 한다.

1. **내부 편집 모델**: OMR/AI가 산출한 결과는 본질적으로 불확실하다. 원본 페이지 좌표, 필드별 신뢰도(confidence), 인식 후보(candidate), 증거 출처(evidence), 사용자 수정 이력, 그리고 슬라이드 발표 구성을 모델 안에 보존해야 검수 UI(Milestone 6)와 발표 구성(Milestone 7)이 성립한다. 이 모델은 서비스의 편집 가능한 단일 진실 원천(editable source of truth)이며, 향후 DB에 영속화(Milestone 4)되어 immutable revision으로 관리될 대상이다.

2. **교환 포맷**: 악보 렌더링 엔진(Verovio), 향후 다른 음악 도구와의 상호운용, 그리고 표준 기반 검증을 위해서는 업계 표준 교환 포맷이 필요하다. MusicXML 4.0 score-partwise가 사실상의 표준이다.

문제는 이 두 요구가 같은 표현으로 충족되지 않는다는 점이다. MusicXML은 악보의 **확정된 음악적 내용**을 기술하도록 설계된 포맷이지, 인식 불확실성·증거·좌표·검수 워크플로 상태를 일급(first-class)으로 표현하기 위한 포맷이 아니다. MusicXML을 그대로 편집 모델 겸 DB 저장 형식으로 사용하면, 위 1번에 열거한 정보들을 비표준 확장 슬롯이나 별도 사이드 테이블에 흩어 보관하게 되어 모델 무결성과 검수 UX가 모두 약해진다.

## Decision (결정)

내부 편집 모델 **ScoreIR**와 교환 포맷 **MusicXML 4.0**을 명시적으로 분리한다.

- **ScoreIR를 단일 진실 원천으로 삼는다.** 좌표/신뢰도/후보/증거/수정 워크플로 상태/슬라이드 계획은 ScoreIR가 보유한다.
- **MusicXML은 ScoreIR로부터 결정적으로 파생되는 단방향 산출물(derived artifact)로만 사용한다.** MusicXML을 DB 편집 모델로 직접 사용하지 않는다.
- 변환은 `serializeMusicXml(score, options)` 한 함수로 캡슐화하며, 동일 머신·동일 입력에 대해 결정적이다(동일 ScoreIR + 동일 옵션 → 동일 문자열).

### ScoreIR가 보유하고 MusicXML이 표현하지 않는 정보

근거: `packages/core/src/types/scoreir.ts`.

- **원본 좌표**: `SourceRegion`(`documentId`, `pageNumber`, `BBox` — 페이지 기준 정규화 [0,1] 좌표, `contentHash`). 각 `Note`/`Rest`는 `sourceRegionId`로 이를 참조한다.
- **필드별 신뢰도**: `NoteConfidence`(`pitch`/`duration`/`lyric` 각각의 신뢰도). 손으로 작성한 데이터에는 부재(absent)할 수 있다.
- **인식 후보 및 불확실성**: `ScoreUncertainty`(`entityId`, `field`, `severity`, `status` open|resolved|dismissed, `candidates: UncertaintyCandidate[]`, `validationFailures`).
- **증거 출처**: `EvidenceSource`(`type` omr|ocr|vision_model|rule_validator|manual, `provider`, `version`, `runId`).
- **수정 워크플로 상태**: 불확실성 항목의 `status`(open|resolved|dismissed)가 검수 진행 상태를 담는다. (전면적 immutable revision 이력은 Milestone 4 범위 — TBD(추후 측정).)
- **슬라이드/발표 계획**: `ScorePresentation`(`order: PresentationItem[]`, `chordVisibility`, `profileRef`). 섹션 단위 running order와 절(verse) 선택을 ScoreIR 안에 둔다.

이들은 모두 "악보가 무엇인가"가 아니라 "이 악보를 어떻게 인식·검수·발표하는가"에 관한 정보로, 교환 포맷의 책임 밖이다.

### MusicXML이 담당하는 것

근거: `packages/core/src/musicxml/serialize.ts`, `packages/core/src/musicxml/xml.ts`.

`serializeMusicXml`는 ScoreIR로부터 MusicXML 4.0 score-partwise 문서를 결정적으로 직렬화한다. 출력은 확정된 음악적 내용(헤더 메타데이터, `divisions`/key/time/clef attributes, 음표·쉼표, tie/slur notations, lyric, barline/repeat/ending)만 담는다. confidence/candidate/bbox/evidence/uncertainty status는 직렬화 대상에서 제외된다.

핵심 특성:

- **마디 부분집합 직렬화**: `SerializeOptions.measureIds`로 슬라이드별 마디 부분집합을 출력하며, 부분집합의 첫 마디에는 활성 attributes(clef/key/time/divisions)를 full로 재기재한다(`computeActiveAttributes` 기반). 화면 중간 시스템 슬라이드도 독립적으로 올바르게 렌더된다.
- **절 필터**: `SerializeOptions.verses`로 특정 절의 가사만 출력하고 출력에서 1..n으로 재번호한다.
- **결정성**: 정렬·고정 순서로 직렬화하여 동일 머신·동일 입력에서 바이트 동일을 보장한다. Milestone 1에서 MusicXML 11,806 bytes가 결정적으로 재현됨이 확인되었다.

### 레이어 경계

레이어 규칙(UI → Application Use Cases → Domain → Provider Interfaces → Infrastructure Adapters)상 ScoreIR와 직렬화기는 Domain(`@worship-score/core`)에 위치하며 외부 엔진/SDK를 직접 import하지 않는다. MusicXML을 소비하는 Verovio 렌더링은 Infrastructure(`@worship-score/adapters`)의 어댑터에서 수행된다. 따라서 교환 포맷은 Domain이 Provider Interface를 통해 인프라로 넘기는 경계 산출물이다.

## Consequences (결과)

### 긍정적 영향

- **편집 모델 무결성**: 좌표·신뢰도·후보·증거·검수 상태가 모델의 일급 필드로 보존되어, 검수 UI(M6)·발표 구성(M7)·런타임 AI 검증(M5)이 자연스러운 데이터 기반을 갖는다.
- **표준 상호운용**: MusicXML 4.0은 Verovio 등 표준 도구와 즉시 호환된다. Milestone 1에서 Verovio 6.2.0 라운드트립(MusicXML→SVG→PNG)이 정상 동작함이 검증되었다.
- **관심사 분리**: "악보 내용"(MusicXML)과 "인식/검수/발표 메타데이터"(ScoreIR)가 분리되어, 각각을 독립적으로 진화시킬 수 있다(예: ScoreIR 스키마 버전 `scoreir-0.1.0`은 OMR 파생 불확실성에 대해 forward-compatible).
- **결정성 확보 지점 명확화**: ScoreIR→MusicXML 변환이 단일 결정적 함수로 격리되어, 회귀 테스트와 골든 비교가 용이하다.

### 부정적 영향 / 비용

- **이중 표현 유지 비용**: 두 표현을 모두 관리해야 하며, 직렬화기는 ScoreIR 스키마 변화에 동기화되어야 한다.
- **단방향 손실**: MusicXML은 ScoreIR의 부분 투영(projection)이므로, MusicXML로부터 ScoreIR를 무손실 복원할 수는 없다(현 단계는 단방향 직렬화만 구현; 역방향 import는 향후 범위 — TBD(추후 측정)).
- **검증 책임 분산**: 엄격한 W3C MusicXML XSD 검증은 현재 미구현이다. 현 단계는 구조 검증(`validateScore`의 12개 규칙) + Verovio 라운드트립(로드 성공)으로 대체하며, XSD 번들 도입은 추후 과제다 — TBD(추후 측정).

### 한계 / 정직한 주의사항

- ScoreIR→MusicXML 직렬화는 동일 머신에서 결정적임이 검증되었다. 다만 다운스트림 PPTX의 바이트 단위 결정성은 별개 사안이며 현재 미보장이다(ADR/파이프라인 다른 문서에서 추적).
- 가사 등 텍스트의 크로스-머신 폰트 결정성은 본 분리 결정과 무관하게 미보장 상태다 — TBD(추후 측정).

## Alternatives Considered (대안 검토)

1. **MusicXML을 편집 모델 겸 DB 저장 형식으로 직접 사용** — 기각.
   - 사유: 좌표·필드별 신뢰도·인식 후보·증거·검수 상태·슬라이드 계획을 표준 MusicXML로 표현할 수 없어, 비표준 확장이나 사이드 테이블로 흩어진다. 검수 UX와 모델 무결성이 모두 약화되고, 결정적 변환 지점을 잃는다.

2. **ScoreIR만 두고 MusicXML을 전혀 도입하지 않음(자체 렌더링)** — 기각.
   - 사유: 표준 악보 렌더 엔진(Verovio)과의 상호운용을 잃는다. 자체 오선 조판 엔진을 처음부터 구현하는 것은 Milestone 1의 "핵심 결정적 체인 우선 증명" 원칙에 어긋나며 비용이 과도하다.

3. **MusicXML을 진실 원천으로 두고 메타데이터를 별도 사이드카(side-car) 문서로 보관** — 기각.
   - 사유: 음표/마디와 좌표·신뢰도·후보 간의 참조 무결성을 두 문서에 걸쳐 수동으로 유지해야 한다. 단일 모델(ScoreIR) 내 참조(`sourceRegionId`, `entityId`)로 표현하는 편이 일관성과 검증 측면에서 우월하다.

## Implementation Notes (구현 근거)

- 내부 모델 정의: `packages/core/src/types/scoreir.ts` (`SCOREIR_SCHEMA_VERSION = "scoreir-0.1.0"`).
- 결정적 직렬화기: `packages/core/src/musicxml/serialize.ts` (`serializeMusicXml`, `SerializeOptions`), 보조 `packages/core/src/musicxml/xml.ts`.
- 활성 attributes 계산: `packages/core/src/context.ts` (`computeActiveAttributes`).
- 스키마 검증: `packages/core/src/schema/scoreir.schema.ts` (zod) + `packages/core/src/validation/index.ts` (`validateScore`, 12개 규칙).
- 교환 포맷 소비처: `packages/adapters/src/verovio/renderer.ts` (Verovio 6.2.0, MusicXML→SVG→PNG).
- Milestone 1 실측: MusicXML 11,806 bytes(결정적 확인), 슬라이드 4장, vitest 27개 전부 통과, `tsc` 타입체크 clean.

## Validation (검증 상태)

- ScoreIR→MusicXML 직렬화 결정성: 검증됨(동일 머신).
- MusicXML 4.0 구조 적합성: Verovio 라운드트립 로드 성공으로 간접 확인. W3C XSD 정합성 검증: 미구현 — TBD(추후 측정).
- 역방향(MusicXML→ScoreIR) 무손실 복원: 미구현(설계상 단방향) — 향후 범위.
