# THIRD_PARTY_LICENSE_REVIEW

> WorshipScore AI — 제3자 라이선스 검토 및 Bill of Materials (BOM)
> 관련 PRD: §19 (라이선스/규정 준수), §20.5 (BOM)
> 문서 상태: Milestone 1 기준 확정. 이후 Milestone에서 의존성이 추가될 때마다 본 문서를 갱신한다.
> 본 문서는 법적 자문이 아니며, 상업 출시 전 법무 검토(legal review) 게이트의 입력 산출물이다.

## 1. 목적과 범위

WorshipScore AI는 찬양 악보 이미지/PDF를 구조화된 악보 데이터(ScoreIR)로 변환하고, 오선·멜로디·리듬·가사를 포함한 예배용 16:9 PPTX를 새로 조판·생성하는 상업용(commercial) SaaS다. 상업적 배포 제품이므로, 런타임에 링크·번들·실행되는 모든 제3자 구성요소의 라이선스 의무를 출시 전에 식별하고 충족해야 한다.

본 문서가 다루는 범위는 다음과 같다.

- Milestone 1에서 실제 코드 경로에 도입되어 실행이 검증된 직접 의존성(direct runtime/dev dependency).
- 도입을 검토했으나 현재 의존성에 **추가하지 않은** 후보 엔진(특히 Audiveris)과 그 게이트 조건.
- 각 구성요소의 SPDX 라이선스, 사용 방식(usage mode), 카피레프트(copyleft) 의무, 소스 공개(source disclosure) 고려사항, 배포 형태(bundled/service), 귀속 표시(attribution) 의무, 법무 검토 상태.

본 문서가 다루지 **않는** 범위.

- 전이 의존성(transitive dependency) 전수 감사. 현 단계에서는 직접 의존성 중심이며, 전이 의존성에 대한 자동 SBOM 생성·전수 라이선스 스캔은 **TBD(추후 측정)**로 두고 M9(상업화)에서 수행한다.
- Next.js/PostgreSQL/Chakra UI 등 M2+에서 도입 예정인 스택. 아직 의존성에 존재하지 않으므로 본 BOM에 포함하지 않는다.

## 2. 컴파일 단위 메모

- 런타임은 Node.js v22.21.0, ESM(NodeNext), 실행 도구는 tsx, 모노레포는 pnpm 워크스페이스다.
- 코드 레이어는 UI → Application Use Cases → Domain → Provider Interfaces → Infrastructure Adapters이며, 제3자 엔진/SDK는 모두 `@worship-score/adapters`(Infrastructure)에 격리된다. Domain(`@worship-score/core`)은 외부 엔진을 직접 import하지 않는다.
- 이 격리는 향후 라이선스 의무가 무거운 엔진을 교체·분리하기 쉽게 만드는 설계상의 안전장치다. 다만, 격리 자체가 카피레프트 의무를 해소하지는 않는다(아래 §5 Audiveris 항목 참조).

## 3. Bill of Materials (BOM)

표기 규칙.

- **license(SPDX)**: 확정된 SPDX 식별자.
- **usage mode**: WASM 임포트 / 네이티브 바인딩 / 순수 JS 라이브러리 등 실제 사용 방식.
- **modified**: 우리가 해당 라이브러리의 소스를 포크·수정했는지 여부. 현재 전 항목 No(미수정, 게시된 버전 그대로 사용).
- **deployment**: `bundled`(우리 서비스 산출물에 함께 배포) / `service`(별도 프로세스/서비스로 분리 호출).
- **attribution**: 배포물에 라이선스 고지/저작권 고지 동봉이 필요한지.
- **source disclosure consideration**: 해당 라이선스가 (재)배포 시 소스 또는 변경분 공개 의무를 유발할 수 있는지에 대한 메모.
- **legal review**: 법무 검토 상태.
- **replacement**: 의무가 과중할 경우의 대체 후보(현재 미평가는 TBD).

| component | version | license (SPDX) | usage mode | modified | deployment | attribution | source disclosure consideration | legal review | replacement |
|---|---|---|---|---|---|---|---|---|---|
| verovio | 6.2.0 | LGPL-3.0-or-later | WASM 모듈 import (MusicXML→SVG). `@worship-score/adapters`의 `VerovioRenderer` | No | bundled | 필요 (LGPL 고지/저작권 동봉) | LGPL 동적 링크/재링크(re-link) 의무 대상. 라이브러리 자체를 수정하지 않고 동적으로 사용. 사용자가 verovio를 교체 가능하도록 하는 의무(상세 §4) 검토 필요 | **TBD(추후 측정)** — 상업 출시 전 법무 승인 필요 | TBD(추후 측정) |
| @resvg/resvg-js | 2.6.2 | MPL-2.0 | 네이티브 바인딩 import (SVG→PNG). `VerovioRenderer` 내부 | No | bundled (플랫폼별 네이티브 바이너리 동봉) | 필요 (MPL 고지 동봉) | MPL은 **파일 단위(file-level) 카피레프트**. 우리가 MPL로 커버되는 원본 파일을 수정하지 않는 한, 우리 코드의 소스 공개 의무는 발생하지 않음. MPL 고지·라이선스 텍스트 보존만 충족하면 됨 | **TBD(추후 측정)** | TBD(추후 측정) |
| pptxgenjs | 4.0.1 | MIT | 순수 JS 라이브러리 (PPTX 빌드). `PptxGenJsBuilder` | No | bundled | 필요 (MIT 저작권/허가 고지 보존) | 없음 (permissive) | 통과 가정 (permissive, 출시 전 형식 확인) | TBD(추후 측정) |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) → **MIT 선택** | 순수 JS (ZIP 로드/검사). `validatePptxOoxml` | No | bundled | 필요 (선택한 MIT 고지 보존) | 없음. **이중 라이선스에서 MIT를 선택**하므로 GPL 의무는 발생하지 않음. 선택 사실을 BOM/NOTICE에 명시 | 통과 가정 (MIT 선택 명시 조건) | TBD(추후 측정) |
| fast-xml-parser | 5.8.0 | MIT | 순수 JS (XML 파싱). `validatePptxOoxml` | No | bundled | 필요 (MIT 고지 보존) | 없음 (permissive) | 통과 가정 | TBD(추후 측정) |
| zod | 3.25.76 | MIT | 순수 JS (스키마 검증). `@worship-score/core`, `adapters` | No | bundled | 필요 (MIT 고지 보존) | 없음 (permissive) | 통과 가정 | TBD(추후 측정) |
| tsx | 4.22.4 | MIT | 개발/실행 런너 (dev/runtime tooling) | No | bundled(런타임 실행) | 필요 (MIT 고지 보존) | 없음 (permissive) | 통과 가정 | TBD(추후 측정) |
| vitest | 2.1.9 | MIT | 테스트 프레임워크 (dev only) | No | 미배포 (dev only) | 배포물에 미포함 시 불요 | 없음 (permissive) | 통과 가정 | TBD(추후 측정) |
| typescript | 5.9.3 | Apache-2.0 | 타입체크/빌드 도구 (dev only) | No | 미배포 (dev only) | 배포물에 미포함 시 불요. Apache-2.0 NOTICE 조건 확인 | 통과 가정 | TBD(추후 측정) |

> 비고: `@resvg/resvg-js`는 플랫폼별 네이티브 바이너리 패키지(예: `@resvg/resvg-js-win32-x64-msvc@2.6.2` 등 다수)를 optional dependency로 함께 가져온다. 이들 네이티브 산출물도 동일 MPL-2.0 라인에 속하는 것으로 간주하되, 배포 시 실제 동봉되는 바이너리의 고지 포함 여부는 **TBD(추후 측정)**로 출시 전 확인한다.

## 4. 카피레프트/조건부 라이선스 상세 메모

### 4.1 verovio 6.2.0 — LGPL-3.0-or-later (동적 링크/재링크 의무)

- verovio는 WASM 모듈로 동적 사용되며, 우리는 라이브러리 소스를 수정하지 않는다(modified: No).
- LGPL의 핵심 의무는 **최종 사용자가 라이브러리를 교체/재링크할 수 있도록 보장**하고, LGPL 라이브러리임을 고지하며, 라이브러리 소스(또는 그 취득 경로)를 제공하는 것이다.
- 동적 링크 형태이므로, 우리 애플리케이션 자체 소스의 공개 의무는 일반적으로 발생하지 않는 것으로 본다. 다만 다음을 출시 전에 확정해야 한다.
  - verovio 버전 정보와 LGPL 라이선스 전문을 배포물/NOTICE에 포함.
  - 사용자가 동등 기능의 수정된 verovio로 교체할 수 있는 실질적 수단(예: 모듈 분리 배포 또는 빌드 지침)의 형태. 구체적 충족 방식은 **TBD(추후 측정)** — 법무·아키텍처 공동 결정.
- 평가/승인: **TBD(추후 측정)**. 상업 출시 전 법무 승인 필수.

### 4.2 @resvg/resvg-js 2.6.2 — MPL-2.0 (파일 단위 카피레프트)

- MPL-2.0은 **수정한 MPL 파일 단위**로만 소스 공개 의무가 발생하는 약한 카피레프트다.
- 우리는 resvg-js 소스를 수정하지 않으므로(modified: No), 우리 코드의 소스 공개 의무는 발생하지 않는다.
- 충족 사항: MPL 라이선스 텍스트·고지 보존, 변경하지 않았다는 사실의 일관성 유지. 만약 향후 포크·패치할 경우 해당 파일에 한해 소스 공개 의무가 생긴다 — 그 시점에 재검토.

### 4.3 jszip 3.10.1 — (MIT OR GPL-3.0-or-later), MIT 선택

- jszip는 이중 라이선스이며, 본 프로젝트는 **MIT를 선택**한다.
- 선택 결과 GPL-3.0-or-later 경로의 카피레프트 의무는 적용되지 않는다.
- 충족 사항: MIT 고지 보존 + BOM/NOTICE에 "MIT 선택" 사실 명시(본 문서로 기록). 산출물 NOTICE 파일에도 동일 문구를 반영한다.

### 4.4 permissive(MIT/Apache-2.0) 항목 일반 의무

- pptxgenjs, fast-xml-parser, zod, tsx (MIT), typescript (Apache-2.0)는 배포 시 저작권/허가 고지 및 라이선스 전문 보존이 핵심 의무다.
- Apache-2.0(typescript)은 NOTICE 파일이 존재할 경우 그 전달 의무가 있으나, typescript는 dev-only 도구로 배포물에 포함되지 않는 것을 전제로 한다. 배포 형태가 바뀌면 재검토.

## 5. 미도입 / 게이트 항목 — Audiveris (AGPL-3.0)

> 이 항목은 BOM에 포함된 의존성이 **아니다.** 현재 의존성 트리에 존재하지 않으며, OMR(광학 악보 인식)은 Milestone 3 범위다. 그럼에도 라이선스 위험이 크므로 별도로 명시·추적한다.

| component | version | license (SPDX) | 상태 | 게이트 조건 |
|---|---|---|---|---|
| Audiveris | (도입 시 결정) | AGPL-3.0 | **미도입(NOT ADDED). 법무 승인 전 프로덕션 경로 사용 금지** | 법무 승인 + 아키텍처 영향 평가 통과 시에만 후보 검토 |

핵심 메모.

- AGPL-3.0은 **네트워크 사용(network use)도 배포로 간주**하여, 해당 소프트웨어와 결합된 시스템의 대응 소스 공개 의무를 유발할 수 있는 강한 카피레프트다. SaaS 형태로 사용자에게 기능을 제공하는 우리 모델에서 특히 위험하다.
- **별도 worker/프로세스 분리가 AGPL 의무를 자동으로 해소한다고 가정하지 않는다.** 프로세스 경계만으로 AGPL의 결합 판정이 면제된다는 보장은 없으며, 결합 여부는 호출 방식·데이터 흐름·통합 정도에 따라 법적으로 판단되어야 한다. 따라서 "별도 worker로 빼면 괜찮다"는 식의 전제는 금지한다.
- 실행 환경상 현재 머신에 Java가 없어 Audiveris/MuseScore CLI 자체가 구동 불가하므로, Milestone 1 단계에서는 코드 경로에 어떤 형태로도 들어가지 않았다(사실상·법적으로 모두 미도입).
- M3 OMR 기술검증 시 Audiveris는 provider interface 뒤의 후보 엔진 중 하나로만 spike 평가하며, 프로덕션 채택 여부는 본 게이트(법무 승인)를 통과해야 한다. 대체 엔진(상용 OMR API 등) 후보 평가 결과는 **TBD(추후 측정)**.

## 6. 결정성·배포 관련 라이선스 인접 메모

라이선스 의무는 아니지만, 배포·재현성·고지 측면에서 출시 전 확인이 필요한 인접 항목.

- PPTX 바이트 단위 결정성은 미보장이다(pptxgenjs가 생성 타임스탬프를 삽입). 라이선스 의무는 아니나, 산출물 정규화 시 메타데이터에 제3자 고지를 어떻게 담을지 함께 결정한다. — **TBD(추후 측정)**
- 가사 텍스트의 크로스-머신 폰트 결정성은 미보장이다(resvg가 시스템 폰트 사용). 폰트를 임베드/고정할 경우, **임베드되는 폰트 자체의 라이선스 검토가 신규로 필요**하다(현재 BOM에 폰트 항목 없음). 폰트 도입 시 본 BOM에 행 추가. — **TBD(추후 측정)**
- 엄격한 W3C MusicXML XSD 검증은 미구현이며, XSD 번들을 도입할 경우 해당 스키마/번들의 라이선스 검토가 신규로 필요하다. — **TBD(추후 측정)**

## 7. 상업 출시 전 라이선스 체크리스트

각 항목은 M9(상업화) 게이트의 필수 통과 조건이다. 현재 상태는 Milestone 1 기준이다.

- [ ] **법무 검토(legal review) 완료** — 전 BOM 항목, 특히 verovio(LGPL) 충족 방식 서면 승인. (현재 verovio/resvg-js: TBD)
- [ ] **verovio LGPL 의무 충족** — 라이선스 전문 동봉 + 버전 고지 + 라이브러리 교체/재링크 보장 수단 확정.
- [ ] **MPL/MIT/Apache 고지 동봉** — 배포물에 NOTICE/THIRD-PARTY-LICENSES 파일 생성, 전문·저작권 보존.
- [ ] **jszip MIT 선택 명시** — 산출물 NOTICE에 "jszip: MIT (dual MIT OR GPL-3.0-or-later 중 MIT 선택)" 문구 포함.
- [ ] **Audiveris(AGPL) 게이트 유지** — 법무 승인 없이는 어떤 프로덕션 경로에도 미도입. worker 분리만으로 의무 해소를 전제하지 않음.
- [ ] **dev-only 도구의 배포 제외 확인** — vitest, typescript가 최종 배포 산출물에 포함되지 않음을 빌드 산출물 기준으로 검증.
- [ ] **전이 의존성 SBOM 생성·스캔** — 자동 SBOM + 라이선스 스캔으로 미식별 카피레프트 부재 확인. (현재 미수행, TBD)
- [ ] **신규 자산 라이선스 검토** — 폰트 임베드, MusicXML XSD 번들 등 추가 시 본 BOM 갱신 후 재검토.
- [ ] **버전 고정·재현성** — pnpm-lock 기준 고정 버전과 본 BOM의 버전/라이선스 일치 확인(드리프트 시 본 문서 갱신).

## 8. 유지보수 규칙

- 새 제3자 의존성을 직접 의존성으로 추가할 때마다 본 BOM 표에 행을 추가하고, 카피레프트/조건부 라이선스이면 §4에 상세 메모를 작성한다.
- 라이브러리를 포크·수정(modified: Yes로 전환)하는 순간, 해당 항목의 source disclosure consideration과 legal review를 재평가한다(특히 LGPL/MPL).
- Audiveris 게이트 상태가 바뀌면(법무 승인 여부) §5를 갱신하고, 채택 시 별도 행이 아닌 본 BOM으로 승격할지 여부를 법무 결정에 따른다.
- 본 문서의 버전/라이선스 값은 Milestone 1 시점 확정 사실이다. 측정되지 않은 값은 'TBD(추후 측정)'로 유지하며, 추측으로 채우지 않는다.
