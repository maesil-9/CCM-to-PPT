# ADR-005: Renderer provider + fallback (Verovio, SVG-우선/PNG-호환)

- **상태(Status):** Accepted
- **결정일(Date):** 2026-06-16
- **Milestone:** Milestone 1 (핵심 결정적 체인 증명)
- **관련 코드:** `packages/adapters/src/verovio/renderer.ts` (`VerovioRenderer`)
- **관련 인터페이스:** `packages/core/src/types/providers.ts` (`RendererProvider`)
- **선행 결정:** ADR-000 (빅뱅 금지 / Milestone 1 우선 증명)

---

## 1. 맥락(Context)

WorshipScore AI의 핵심 산출물은 가사 자막형 슬라이드가 아니라 **오선·멜로디·리듬·가사가 포함된 실제 악보가 조판된 16:9 PPTX**다. 따라서 파이프라인 중간에 `ScoreIR → MusicXML`을 시각적으로 정확하게 렌더링하는 단계가 반드시 필요하며, 이 렌더 결과(이미지)가 곧 발표 슬라이드의 시각 콘텐츠가 된다.

렌더링 단계에는 다음 제약이 걸린다.

- **결정성(determinism):** Milestone 1의 핵심 명제는 "동일 입력 → 동일 산출물"이다. 렌더러는 RNG·시계(clock)에 의존하지 않고, 동일 머신에서 동일 입력에 대해 동일 SVG/PNG를 내야 한다.
- **레이어 경계:** Domain(`@worship-score/core`)은 외부 렌더 엔진/SDK를 직접 import하지 않는다. Domain은 `RendererProvider` 인터페이스에만 의존하고, 구체 어댑터는 Infrastructure(`@worship-score/adapters`)에 격리된다.
- **두 가지 출력 형태 요구:** 벡터 기반 SVG는 품질·검수에 유리하지만, 다운스트림(PptxGenJS PPTX 조판, OOXML 검증, 미리보기)은 래스터 PNG를 요구한다. 즉 SVG-우선 + PNG-호환 경로가 동시에 필요하다.
- **실행 환경 제약:** 현 단계 머신에 Java가 없어 Audiveris/MuseScore CLI 계열은 사용 불가하다(해당 도구는 OMR 영역으로 Milestone 3 사안이며 렌더러 선택과 무관). 렌더러는 Java 비의존이어야 한다.

이 ADR은 (a) 렌더러를 어떻게 추상화할 것인가, (b) 초기 구체 구현으로 무엇을 채택할 것인가, (c) SVG 실패·호환 상황에 대한 fallback/대체 경로를 어떻게 설계할 것인가를 결정한다.

---

## 2. 결정(Decision)

### 2.1 RendererProvider 추상화

Domain에 `RendererProvider` 포트(provider interface)를 정의하고, 모든 렌더 구현은 이를 구현한다. 인터페이스 핵심 형태는 다음과 같다(확정, `packages/core/src/types/providers.ts`).

- `RenderOutputMode = "svg" | "png"` — 출력 모드를 호출 측에서 선택.
- `renderScore(input: RenderScoreInput): Promise<RenderScoreResult>` — MusicXML 전체를 페이지 단위로 렌더.
- `renderSystem(input: RenderSystemInput): Promise<RenderSystemResult>` — 시스템(마디 부분집합) 단위 렌더.
- `healthCheck(): Promise<ProviderHealth>` — 엔진 가용성 프로브.
- `providerName` / `providerVersion` 노출, 결과 객체에 `providerName`·`providerVersion`·`runId` 기록(traceability).

`RenderScoreInput`은 `musicXml: string`, `outputMode`, 선택적 `options: RenderOptions`를 받는다. `RenderOptions`에는 `scale`, `pageWidth`, `pageHeight`, `adjustPageHeight`, `minStaffSize`, 그리고 엔진별 옵션을 Domain 밖으로 빼두는 escape hatch `rendererOptions: Record<string, unknown>`가 있다. 이로써 엔진 특화 파라미터가 Domain 타입을 오염시키지 않는다.

`RenderedPage`는 SVG 모드일 때 `svg?: string`, PNG 모드일 때 `png?: Uint8Array`를 담고, 두 경우 모두 `widthPx`/`heightPx`를 보고한다. 출력 모드에 따라 채워지는 필드가 달라지는 단일 페이지 표현으로 두 경로를 통합한다.

### 2.2 초기 구체 구현: VerovioRenderer

초기 `RendererProvider` 구현으로 **Verovio 6.2.0**(LGPL-3.0-or-later, WASM 빌드)을 채택한다. 구현은 `packages/adapters/src/verovio/renderer.ts`의 `VerovioRenderer`이며 `providerName = "verovio"`.

- **MusicXML → SVG:** Verovio WASM 토킷(`VerovioToolkit`)을 비동기 로드(`VerovioRenderer.create()`)하고, `loadData(musicXml)` 후 `renderToSVG(page)`로 페이지별 SVG를 얻는다. Verovio는 음악 폰트를 벡터 path로 임베드하므로, 주어진 입력에 대한 SVG 지오메트리가 결정적이다.
- **결정적 runId:** `runId`는 입력(`musicXml + "|" + outputMode`)의 **FNV-1a 32-bit 해시**(8 hex)로 생성한다. RNG/시계를 쓰지 않으므로 동일 입력 → 동일 runId.
- **버전 보고:** `toolkit.getVersion()`을 `providerVersion`으로 노출(실패 시 `"6.x"` 폴백).
- **렌더 옵션 기본값:** `scale: 50`, `pageWidth` 기본 2400, `breaks: "auto"`, `header/footer: "none"`, `svgViewBox: true`, 여백 60 등 결정적 고정값 사용. 호출 측 `RenderOptions`로 일부 override 가능.

Verovio는 Java 비의존(WASM)이고 MusicXML 입력을 직접 처리하므로 현 실행 환경 제약과 Domain 경계 제약을 모두 만족한다.

### 2.3 PNG 호환 경로 및 fallback 설계

다운스트림(PPTX 조판·OOXML 검증·미리보기)은 PNG를 요구하므로, SVG를 PNG로 래스터화하는 호환 경로를 둔다.

- **SVG → PNG:** **@resvg/resvg-js 2.6.2**(MPL-2.0)를 사용해 Verovio가 만든 SVG를 PNG로 렌더한다. `outputMode === "png"`일 때 `Resvg(svg, { background: "white", fitTo: { mode: "zoom", value: rasterScale }, font: { loadSystemFonts: true } })`로 변환하며, `rasterScale` 기본값은 2.
- **단일 진실 원천(single source of truth):** PNG는 별도 렌더 엔진이 아니라 **동일한 Verovio SVG를 래스터화한 결과**다. 즉 SVG와 PNG는 같은 벡터 지오메트리에서 파생되어 두 출력 간 시각적 일관성이 보장된다.
- **부분 렌더:** `renderSystem`은 Milestone 1에서 마디 부분집합을 슬라이드 단위로 렌더하기 위해 `renderScore`에 위임한다(시스템 = 작은 마디 부분집합).
- **healthCheck 프로브:** 최소 MusicXML 4.0 score-partwise(4/4, G clef, whole note C4)를 `loadData` 후 `getPageCount() >= 1`인지 확인해 엔진 가용성을 보고한다. 이는 fallback 의사결정(엔진이 살아있는지)을 위한 결정적 프로브다.

### 2.4 "fallback"의 의미 범위

본 ADR에서 fallback은 **(1) 출력 형태 대체**와 **(2) 엔진 교체 가능성**의 두 층위를 가진다.

1. **출력 형태 대체(구현됨):** SVG를 사용할 수 없거나 다운스트림이 비벡터를 요구하는 경우, 동일 Verovio SVG를 resvg로 PNG화하는 호환 경로가 일차 fallback이다. Milestone 1 체인은 실제로 이 PNG 경로를 사용한다.
2. **엔진 교체 가능성(인터페이스로 보장, 대체 엔진 미구현):** `RendererProvider` 추상화 덕분에 Verovio 외 다른 렌더 엔진을 동일 포트에 끼워 넣을 수 있다. 단, 현재 시점에 **second 렌더 엔진은 구현하지 않았다.** 따라서 "엔진 단위 자동 fallback"은 인터페이스 차원의 미래 옵션으로만 열려 있으며, 구체 대체 엔진·자동 전환 정책은 TBD(추후 측정).

---

## 3. 근거(Rationale)

- **Verovio 채택 이유:** MusicXML을 직접 입력으로 받고, 음악 폰트를 벡터로 임베드해 결정적 SVG를 생성하며, WASM 빌드로 Java 비의존이라 현 실행 환경(Java 없음)과 Domain 경계 제약을 동시에 만족한다. LGPL-3.0-or-later로 라이브러리 링크 사용이 가능하다.
- **SVG-우선:** 벡터는 해상도 독립적이고 검수·확대에 유리하다. Verovio가 폰트를 path로 임베드하므로 텍스트/음표 기호의 SVG 결정성이 확보된다.
- **PNG 호환 경로:** PPTX 조판(PptxGenJS)·OOXML 검증·미리보기는 래스터 이미지를 요구한다. resvg-js는 Node 네이티브로 SVG를 결정적으로 래스터화할 수 있어 호환 경로에 적합하다(MPL-2.0).
- **추상화 우선:** Domain이 엔진에 직접 의존하지 않으므로, 미래에 더 나은 렌더 엔진이 등장하거나 특정 입력에서 Verovio가 부적합할 때 어댑터 교체만으로 대응할 수 있다(빅뱅 금지 원칙과 정합).

---

## 4. 결과(Consequences)

### 4.1 긍정적

- **결정성 확보(검증됨):** `ScoreIR → MusicXML → SVG/PNG`는 동일 머신에서 결정적임이 Milestone 1에서 실증되었다. `pnpm m1` 실행 시 PNG 4장(2400×314px)이 결정적으로 생성되었고, 전체 체인(스키마 통과, 검증 blocking 0/warning 0, MusicXML 11806 bytes 결정적, 슬라이드 4장, PPTX 213,481 bytes 4슬라이드)이 통과했다. 슬라이드 PNG에 높은음자리표·4/4·멜로디 음표·마디선·한글 가사가 정확히 렌더됨을 시각 확인했다.
- **레이어 경계 유지:** Domain은 `RendererProvider`에만 의존하고 Verovio/resvg import은 어댑터에 격리되었다.
- **교체 용이성:** 향후 대체 엔진을 동일 포트로 도입 가능.
- **테스트로 보호:** vitest 27개 전부 통과(core 21 + pipeline fixture 5 + e2e 1[render→pptx→ooxml]), `tsc -p tsconfig.json` 타입체크 clean.

### 4.2 부정적 / 한계(정직하게 기재)

- **크로스-머신 폰트 결정성 미보장:** PNG 래스터화 시 resvg가 시스템 폰트를 로드(`loadSystemFonts: true`)하므로, 가사 텍스트 등에서 다른 머신·다른 폰트 환경 간 픽셀 일치는 보장되지 않는다. 폰트 임베드/고정은 추후(TBD).
- **엔진 단위 자동 fallback 미구현:** 본 ADR은 second 렌더 엔진을 도입하지 않았다. 인터페이스로 교체 가능성만 열어 두었고, 자동 전환 정책·대체 엔진 선정은 TBD(추후 측정).
- **MusicXML XSD 검증 미구현:** 입력 MusicXML에 대한 엄격한 W3C XSD 검증은 미구현이며, 현재는 구조 검증 + Verovio 라운드트립(`loadData` 로드 성공)으로 대체한다. XSD 번들 도입은 추후.
- **결정성 범위:** 결정성 검증은 동일 머신 기준이다. 크로스-머신/크로스-OS 비트 동일성은 본 ADR 범위 밖이며 별도 정규화·고정이 필요하다.

### 4.3 후속 작업(Follow-ups)

- 폰트 임베드/고정으로 크로스-머신 가사 렌더 결정성 확보(TBD).
- 필요 시 second 렌더러 도입 시 동일 `RendererProvider` 포트 준수 + healthCheck 기반 전환 정책 정의(TBD).
- MusicXML XSD 번들 검증 단계 추가 검토(TBD).

---

## 5. 라이선스(License) 영향

- **verovio 6.2.0** — LGPL-3.0-or-later (WASM 라이브러리 링크 사용).
- **@resvg/resvg-js 2.6.2** — MPL-2.0.

두 의존성 모두 현 사용 형태(라이브러리 링크/모듈 사용)에서 채택 가능하다. 참고로 Audiveris(AGPL-3.0)는 렌더러가 아닌 OMR(Milestone 3) 사안으로 현재 의존성에 포함하지 않으며, 본 ADR의 렌더 경로와 무관하다.

---

## 6. 대안(Alternatives Considered)

- **MuseScore/Audiveris CLI 계열:** Java 의존으로 현 실행 환경(Java 없음)에서 사용 불가. 또한 Audiveris는 AGPL-3.0로 별도 법무 게이트 대상. 렌더 목적에 부적합.
- **별도 second 렌더 엔진을 즉시 도입해 이중화:** 빅뱅 금지/Milestone 1 우선 증명 원칙에 반함. 핵심 체인을 먼저 단일 결정적 엔진으로 증명한 뒤, 필요 시 포트를 통해 추가하는 편이 비용·복잡도 측면에서 합리적이라 보류.
- **SVG만 산출(PNG 경로 없음):** 다운스트림 PPTX 조판·OOXML 검증·미리보기가 래스터를 요구하므로 불가. PNG 호환 경로는 필수.
