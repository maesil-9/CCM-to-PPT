# ADR-006: SVG-우선, PNG 호환 (SVG-first with PNG compatibility)

- **상태(Status):** Accepted
- **결정일(Date):** 2026-06-16
- **맥락 마일스톤(Milestone):** Milestone 1 (결정적 핵심 체인 증명)
- **관련 컴포넌트:** `@worship-score/adapters` (`src/verovio/renderer.ts`, `src/pptx/builder.ts`), `@worship-score/core` (`src/types/providers.ts`)
- **관련 PRD 요구:** RND-001/RND-002(SVG-first + 고해상도 PNG 호환), PPT-001/PPT-002(PPTX에 PNG 임베드), 수용 기준 "슬라이드 요소 잘림 0"

## 컨텍스트 (Context)

WorshipScore AI는 찬양 악보를 구조화된 `ScoreIR`로 변환하고, 오선·멜로디·리듬·가사가 포함된 예배용 16:9 PPTX를 새로 조판한다. 악보를 PPTX 슬라이드에 실으려면 렌더된 악보 이미지를 슬라이드 자산으로 임베드해야 하는데, 자산 포맷 선택이 두 가지 상충하는 요구를 동시에 만족해야 한다.

1. **품질·결정성·재현성.** 악보는 벡터 기하로 표현될 때 무손실 확대가 가능하고, 동일 입력에 대해 동일 출력(결정적)을 보장하기 쉽다. Verovio는 악보용 음악 폰트를 벡터 패스로 SVG에 임베드하므로, 주어진 MusicXML에 대한 SVG 기하는 결정적이다(같은 머신 기준, 검증됨).
2. **PowerPoint 호환성.** PowerPoint의 SVG 지원은 버전·플랫폼에 따라 편차가 크고, "수리 경고 없이 열기"를 신뢰성 있게 보장하기 어렵다. PRD는 PPTX에 임베드되는 악보 자산을 **고해상도 PNG**로 못박는다(필수). 즉, 표시·교환 포맷으로는 래스터(PNG)가 안전하다.

이 두 요구는 단일 포맷으로는 동시에 만족되지 않는다. SVG만 채택하면 PowerPoint 호환이 불확실하고, PNG만 채택하면 무손실 1차 자산(편집·재래스터·향후 검수 UI 오버레이의 기준점)을 잃는다.

## 결정 (Decision)

**1차 자산은 SVG로 두되, PPTX에 임베드되는 호환 자산은 고해상도 PNG로 한다 (SVG-first, PNG-compatible).**

구체적으로:

- `RendererProvider`는 `RenderOutputMode = "svg" | "png"` 두 모드를 모두 산출할 수 있는 단일 계약을 가진다(`packages/core/src/types/providers.ts`). `RenderedPage`는 모드에 따라 `svg?: string` 또는 `png?: Uint8Array` 중 하나를 담고, 양쪽 모두 `widthPx`/`heightPx`를 보고한다.
- 어댑터 `VerovioRenderer`(`src/verovio/renderer.ts`)는 동일한 Verovio WASM 파이프라인으로 SVG를 먼저 생성한다. `outputMode === "svg"`이면 SVG 문자열을 그대로 반환하고, `outputMode === "png"`이면 그 SVG를 `@resvg/resvg-js`로 래스터화하여 PNG를 반환한다. 즉 **PNG는 SVG에서 파생된 자산**이며, SVG가 진실의 원천(source of truth)이다.
- `PptxBuilder`의 슬라이드 이미지 계약 `PptxImage`는 `mime: "image/png"`로 고정된다. `PptxGenJsBuilder`(`src/pptx/builder.ts`)는 PNG를 base64 data URI(`data:image/png;base64,...`)로 임베드하며, SVG를 PPTX에 직접 넣지 않는다. 이로써 PowerPoint 호환 경로는 PNG 단일 포맷으로 통일된다.
- PNG는 슬라이드의 안전여백(safe-margin) 콘텐츠 박스 안에 **종횡비 보존 contain-fit**으로 배치한다(`fitContain`). 박스를 절대 넘지 않도록 스케일을 `min(box.w/imgW, box.h/imgH)`로 잡고 중앙 정렬하므로, 요소 잘림이 0이다(수용 기준 충족).

### 래스터화 파라미터 (현 구현 기준)

- Verovio 옵션: `scale=50`, 기본 `pageWidth=2400`, `pageHeight=1200`, `adjustPageHeight=true`, 상하좌우 마진 60, `breaks="auto"`, `header/footer="none"`, `svgViewBox=true`.
- PNG 래스터화: `@resvg/resvg-js`의 `fitTo: { mode: "zoom", value: rasterScale }`, 기본 `rasterScale = input.options?.scale ?? 2`, 배경 흰색. Milestone 1 fixture에서 페이지당 2400×314px PNG가 결정적으로 산출됨(검증됨).
- 슬라이드는 16:9(13.333×7.5in)로 고정.

## 근거 (Rationale)

- **무손실 1차 자산 보존.** SVG를 기준 자산으로 유지하면 임의 해상도로 재래스터링이 가능하고, 향후 검수 UI(M6 3열)의 좌표 오버레이·소스 영역 하이라이트가 벡터 기하 위에서 정밀하게 동작할 여지를 남긴다.
- **호환 리스크의 단일 지점화.** PowerPoint 호환 위험을 PNG라는 한 포맷으로 격리한다. 슬라이드에 들어가는 것은 항상 래스터 이미지이므로, 뷰어별 SVG 렌더링 편차에 노출되지 않는다.
- **결정성 확보(부분).** SVG 기하와 SVG→PNG 변환은 동일 머신에서 결정적임이 검증되었다. `runId`는 입력 해시(FNV-1a 32-bit, `musicXml + outputMode`)로 산출되어 RNG/시계에 의존하지 않는다.
- **계약 단순성.** 렌더러가 두 모드를 같은 인터페이스로 노출하므로, 파이프라인은 "1차 자산은 SVG, 임베드는 PNG"를 호출 측에서 모드 선택만으로 표현한다. 도메인은 어떤 엔진도 직접 import하지 않는다(레이어 규칙 유지).

## 고려한 대안 (Alternatives Considered)

- **SVG만 PPTX에 임베드.** 거부 — PowerPoint의 SVG 지원이 버전/플랫폼에 따라 불안정하여 "수리 경고 없이 열기"를 보장하기 어렵고, PRD가 PNG 임베드를 필수로 규정함.
- **PNG만 산출(SVG 폐기).** 거부 — 무손실 1차 자산을 잃어 재래스터·검수 오버레이·향후 편집 기준점이 사라짐. 결정성 검증과 디버깅도 어려워짐.
- **EMF/WMF 벡터 임베드.** 거부 — Windows 종속 포맷으로 크로스-플랫폼 생성 경로(Node/resvg)에 부적합하고, 검증·결정성 보장 비용이 큼.
- **PDF 임베드.** 거부 — 슬라이드 인라인 표시 자산으로 부적합하며 PPTX 호환 목표와 어긋남.

## 결과 (Consequences)

### 긍정적

- PPTX 호환 경로가 PNG 단일 포맷으로 단순·안정화됨. Milestone 1에서 OOXML 검증 13개 항목 전부 통과(`each_slide_has_image` 포함), PPTX 213,481 bytes·4슬라이드 산출, 시각 확인 시 높은음자리표·4/4·음표·마디선·한글 가사가 정확히 렌더됨(악보형 PPT 실증).
- contain-fit 배치로 요소 잘림 0을 구조적으로 보장.
- SVG/PNG 양산 계약으로 향후 자산 용도 확장(웹 미리보기 SVG, 임베드 PNG)이 같은 렌더러로 가능.

### 부정적 / 트레이드오프

- **PNG는 해상도 종속.** 임베드 시점의 `rasterScale`가 최종 표시 품질 상한을 결정. 확대 시 품질 저하 가능 — 필요 해상도는 슬라이드 박스 대비 충분히 잡아야 함(현재 2× zoom).
- **저장 비용 증가.** SVG와 PNG를 모두 보관·전송할 경우 자산 용량이 늘어남(영속화 정책은 M4에서 결정).

### 미해결 / 주의 (Honest limitations)

- **PPTX 바이트 단위 결정성 미보장.** pptxgenjs가 생성 타임스탬프를 삽입하므로 PPTX는 아직 바이트 결정적이지 않다. 정규화는 추후. (SVG/PNG 자체는 결정적.)
- **크로스-머신 폰트 결정성 미보장.** 가사 텍스트 래스터화 시 resvg가 시스템 폰트를 사용(`loadSystemFonts: true`)하므로 머신 간 글리프 차이가 날 수 있다. 폰트 임베드/고정은 추후.
- **PowerPoint "수리 경고 없이 열기" 라이브 테스트 미실행.** 빌드 머신에 Office가 없어 수동/CI 절차로 추적. 현재는 OOXML 구조 검증으로 대체.
- **목표 표시 해상도(DPI) 및 권장 `rasterScale` 기준값:** TBD(추후 측정).

## 후속 작업 (Follow-ups)

- PPTX 출력 정규화로 바이트 결정성 확보(타임스탬프 제거/고정).
- 폰트 임베드 또는 고정 폰트셋 도입으로 가사 래스터의 크로스-머신 결정성 확보.
- 실제 PowerPoint 라이브 오픈 테스트의 수동/CI 절차 수립.
- 검수 UI(M6) 도입 시 SVG 1차 자산 위 좌표 오버레이 설계.

## 참조 (References)

- ADR-000 (스택·레이어·"빅뱅 금지" 원칙)
- PRD §RND-001/RND-002, §PPT-001/PPT-002
- `packages/core/src/types/providers.ts` — `RenderOutputMode`, `RenderedPage`, `PptxImage`(`mime: "image/png"`)
- `packages/adapters/src/verovio/renderer.ts` — `VerovioRenderer`(verovio 6.2.0 WASM + @resvg/resvg-js 2.6.2)
- `packages/adapters/src/pptx/builder.ts` — `PptxGenJsBuilder`(pptxgenjs 4.0.1), `fitContain`
- 제3자 라이선스: verovio 6.2.0 (LGPL-3.0-or-later), @resvg/resvg-js 2.6.2 (MPL-2.0), pptxgenjs 4.0.1 (MIT)
