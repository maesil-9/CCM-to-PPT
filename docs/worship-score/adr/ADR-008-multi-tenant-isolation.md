# ADR-008: 멀티테넌트 격리 (Multi-Tenant Isolation)

- 상태(Status): Accepted (방향 확정) / 미구현 (Not yet implemented — 구현은 Milestone 2/3 이후)
- 일자(Date): 2026-06-16
- 결정자(Deciders): WorshipScore AI 구현 팀
- 관련(Related): ADR-000(스택·레이어링 원칙), 향후 M2(업로드/작업 파이프라인), M3(OMR), M9(상업화)
- 적용 범위(Scope): packages 전반의 향후 Application/Infrastructure 레이어, ObjectStorageProvider 및 JobQueueProvider 구현체, 미도입 DB(PostgreSQL 예정)

## 맥락 (Context)

WorshipScore AI는 찬양 악보 이미지/PDF를 ScoreIR로 변환하고 예배용 16:9 PPTX를 조판·생성하는 상업용 SaaS다. 상업 서비스 특성상 다수의 조직(교회/팀)이 동일 인프라를 공유하며, 각 조직은 다음과 같은 민감·권리성 콘텐츠를 보유한다.

- 업로드된 원본 악보 이미지/PDF (저작권·권리확인 대상)
- 변환된 ScoreIR 및 파생 산출물(MusicXML, SVG/PNG, PPTX, preview)
- 작업(job) 메타데이터 및 검수 이력

한 조직의 콘텐츠가 다른 조직에 노출되면 저작권·프라이버시·계약 위반으로 직결되므로, 멀티테넌트 격리는 보안의 1차 통제선이다. 특히 IDOR(Insecure Direct Object Reference)는 SaaS에서 가장 흔하고 치명적인 취약점 부류이므로, 데이터 모델·접근 경로·객체저장·signed URL 발급의 모든 경계에서 조직 소속을 강제해야 한다.

### 현재 구현 상태와의 관계

본 저장소는 "빅뱅 금지 / Milestone 1 우선 증명" 원칙(ADR-000)에 따라 웹 프레임워크·DB·인증·UI를 아직 도입하지 않았다. 현재 구현된 범위는 다음 결정적 핵심 체인뿐이다.

> ScoreIR → zod schema → validateScore → MusicXML 4.0 → Verovio(SVG+PNG) → slide plan → PptxGenJS PPTX → OOXML 검증 → preview(PNG)

이 체인은 단일 사용자·로컬 fixture 기반으로 `pnpm m1`을 통해 실증되었으며, 테넌트·인증·저장 경계가 존재하지 않는다. `ObjectStorageProvider`와 `JobQueueProvider`는 `packages/core/src/types/providers.ts`에 인터페이스로만 정의되어 있고 멀티테넌트 구현체는 아직 없다. 따라서 본 ADR은 즉시 적용되는 결정이 아니라, M2(업로드/작업 파이프라인)에서 DB·객체저장·작업 상태기계를 도입하는 시점에 강제될 구속적 설계 방향을 사전에 확정하는 문서다.

## 결정 (Decision)

모든 사용자 콘텐츠는 단일 테넌트 식별자 `organization_id`에 귀속되며, 데이터 접근·객체저장·URL 발급의 전 경로에서 조직 경계를 기본값(default-deny)으로 강제한다. 구체 원칙은 다음과 같다.

### 1. 모든 사용자 콘텐츠는 `organization_id`에 귀속

- 업로드, ScoreIR, 파생 산출물, job, 검수 이력 등 사용자 생성·파생 데이터의 모든 영속 레코드는 `organization_id` 컬럼/필드를 필수(non-null)로 가진다.
- `organization_id`는 콘텐츠 생성 시점에 인증 컨텍스트(authenticated principal)로부터 서버 측에서 주입한다. 클라이언트가 보낸 `organization_id`를 신뢰하지 않는다(클라이언트 입력은 소속 검증의 대상일 뿐 소속 결정의 근거가 아니다).
- 콘텐츠는 immutable revision 모델(M4 예정)에서도 동일 조직 경계를 상속한다.

### 2. DB 조직조건 강제 (tenant predicate enforcement)

- 사용자 콘텐츠를 조회·수정·삭제하는 모든 쿼리는 `organization_id = <current org>` 술어를 반드시 포함한다. 이 술어가 없는 쿼리는 금지한다.
- 강제 메커니즘은 애플리케이션 레이어 단일 지점(테넌트-스코프 리포지토리/데이터 접근 계층)에 수렴시켜, 개별 use case가 술어를 누락할 표면을 제거한다. DB 차원의 추가 방어(예: PostgreSQL Row-Level Security)는 도입 시 보완 통제로 검토한다. 구체 채택 여부 및 정책은 TBD(추후 측정).
- Domain 레이어는 외부 엔진/SDK를 직접 import하지 않는다는 ADR-000 레이어링 원칙에 따라, 테넌트 술어 강제는 Application/Infrastructure 경계에서 구현하고 Domain 타입(ScoreIR 등)은 테넌트 인프라에 비의존 상태를 유지한다.

### 3. 객체저장 경로 분리 (object storage path partitioning)

- `ObjectStorageProvider`로 저장되는 모든 객체(원본 업로드, PNG, PPTX, preview 등)의 키(key)는 `organization_id`를 경로 접두사로 포함한다. 권장 형태: `org/<organization_id>/...` (정확한 키 스킴 및 추가 세그먼트는 구현 시 확정, TBD).
- 키 구성에 사용하는 `organization_id`는 인증 컨텍스트에서만 도출하며, 사용자 입력 경로 조각을 그대로 키에 합성하지 않는다(path traversal 방지: `..`, 절대경로, 인코딩 우회 차단).
- 경로 분리는 편의적 네임스페이스일 뿐 권한 통제 자체가 아니다. 즉, "경로를 안다"는 사실이 접근 권한을 의미하지 않으며, 실제 접근은 항상 아래 4·5의 권한 검증을 통과해야 한다.

### 4. signed URL 발급 전 권한 재검증

- 객체에 대한 signed URL(다운로드/미리보기용 시간제한 URL)을 발급하기 전에, 요청 주체가 해당 객체의 `organization_id`에 속하는지 서버 측에서 재검증한다.
- 재검증은 객체 키에 포함된 `organization_id`가 현재 인증 주체의 조직과 일치하는지 확인하는 것으로 끝나지 않고, 권한 레코드(소유 조직·리소스 가시성)를 신뢰 가능한 소스(DB)에서 조회해 확인한다.
- 발급되는 signed URL은 최소 권한·최소 수명을 따른다. 만료 시간(TTL) 및 허용 동작(읽기 전용 등)의 구체값은 TBD(추후 측정).

### 5. IDOR 방지 (default-deny on direct reference)

- 모든 리소스 접근은 식별자(예: scoreId, jobId, assetKey) 자체를 권한 근거로 삼지 않는다. 식별자 보유 여부와 무관하게, 조회 시점에 `organization_id` 일치 및 권한 레코드를 확인한 뒤에만 접근을 허용한다(default-deny).
- 권한 불일치 시 응답은 리소스 존재 여부를 누설하지 않도록 일관된 형태로 처리한다(예: 404/403 정책). 구체 응답 정책은 TBD(추후 측정).
- 테넌트 경계 위반(cross-tenant access) 시도는 보안 이벤트로 분류하여 감사 로그(M9 예정)에 기록한다.

## 구현 위치 및 적용 단계 (Implementation Placement)

레이어링 원칙(UI → Application Use Cases → Domain → Provider Interfaces → Infrastructure Adapters)에 본 결정을 다음과 같이 배치한다.

| 레이어 | 책임 |
| --- | --- |
| Application Use Cases | 인증 컨텍스트에서 `organization_id` 도출, 테넌트 술어 주입, signed URL 발급 전 권한 재검증, default-deny 분기 |
| Provider Interfaces (`packages/core/src/types/providers.ts`) | `ObjectStorageProvider`/`JobQueueProvider` 계약에 테넌트 스코프를 반영(구현 시 시그니처 확정, TBD) |
| Infrastructure Adapters (`packages/adapters`) | 객체저장 키 접두사 적용, DB 테넌트 리포지토리, signed URL 발급 어댑터 |
| Domain (`packages/core`) | 테넌트 인프라 비의존 유지(ScoreIR 등 순수 타입·로직) |

적용 단계는 다음과 같다.

- M2: 업로드/작업 파이프라인 도입 시 DB(PostgreSQL 예정) 스키마에 `organization_id`를 필수화하고, 테넌트 리포지토리·객체저장 경로 분리·signed URL 권한 재검증을 1차 구현한다.
- M3: OMR provider 경로에서도 동일 테넌트 경계를 적용한다. (Audiveris는 AGPL-3.0 게이트 대상이며 본 ADR과 무관하게 별도 승인 필요.)
- M9: 감사 로그·과금·백업·SBOM·라이선스 승인과 함께 테넌트 격리의 운영·증빙 통제를 완성한다.

## 대안 (Alternatives Considered)

- 조직별 물리적 격리(DB/버킷 분리): 격리 강도는 높으나 그린필드·초기 단계에서 운영 복잡도와 비용이 과다하다. 단일 DB + 테넌트 술어 + 객체 경로 분리 + 발급 전 권한 재검증의 조합을 1차 채택하고, 물리 격리는 상위 등급 고객·규제 요건 발생 시 재검토한다.
- 클라이언트 제공 `organization_id` 신뢰: IDOR·테넌트 혼선 위험으로 거부. 소속은 항상 서버 측 인증 컨텍스트에서 도출한다.
- 객체저장 경로 분리만으로 접근 통제 대체: "경로 추측 불가"에 의존하는 보안은 IDOR에 취약하므로 거부. 경로 분리는 네임스페이스 편의이며 권한 통제는 별도로 항상 수행한다.

## 결과 (Consequences)

긍정적:

- 데이터 접근·저장·URL 발급의 모든 경계에서 일관된 default-deny 테넌트 격리를 확보해 IDOR·cross-tenant 노출 표면을 구조적으로 축소한다.
- 테넌트 술어 강제를 단일 데이터 접근 계층에 수렴시켜, use case 증가에 따른 누락 위험을 줄인다.
- Domain을 테넌트 인프라에 비의존으로 유지해 ADR-000 레이어링과 결정적 핵심 체인을 보존한다.

부정적/주의:

- 모든 데이터 접근 경로에 테넌트 컨텍스트 전파가 필요해, M2 도입 시 Application/Infrastructure 설계 부담이 증가한다.
- DB 차원 방어(예: RLS) 채택 여부, signed URL TTL/정책, 권한 불일치 응답 정책, 객체 키 스킴 등 다수 운영 파라미터가 미확정(TBD, 추후 측정)이다.
- 본 결정은 인증·인가(authn/authz) 메커니즘이 도입되어야 실효성을 가지며, 해당 설계는 별도 ADR에서 확정한다.

## 검증 계획 (Verification — 미실행, 향후)

구현 후 다음을 통해 격리를 검증한다(현 단계 미실행).

- 자동 테스트(vitest): 동일 식별자에 대해 다른 조직 주체로 접근 시 default-deny되는지, 테넌트 술어 누락 쿼리가 차단되는지에 대한 property/단위 테스트.
- cross-tenant 접근 시도(IDOR) 시나리오의 e2e 테스트.
- signed URL 발급 경로에서 발급 전 권한 재검증이 우회되지 않는지 검증.
- 보안 리뷰(M9 상업화 전): 테넌트 경계 통제의 코드 리뷰·위협 모델링.

측정 수치(누설율, 테스트 커버리지 등)는 구현 전이므로 TBD(추후 측정).
