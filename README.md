# WorshipScore AI

찬양 악보(이미지/PDF)를 구조화된 악보 데이터(`ScoreIR`)로 변환하고, **오선·멜로디·리듬·가사가
포함된 예배용 16:9 PPTX를 새로 조판·생성**하는 상업용 서비스입니다. 가사만 보여주는 자막형
PPT가 아니라, 화면용으로 재조판한 실제 악보를 슬라이드로 만듭니다.

> 상세 기획은 [worship-score-ai-commercial-prd-and-agent-prompt.md](worship-score-ai-commercial-prd-and-agent-prompt.md)
> (PRD + 구현 마스터 프롬프트)를 참고하세요.

## 현재 상태 — Milestone 1 완료 ✅

PRD가 규정한 "빅뱅 금지 / 결정적 출력 체인을 먼저 증명" 원칙에 따라, OMR·업로드·DB·UI보다 먼저
**고정 ScoreIR fixture로부터 실제 PPTX를 생성·검증하는 결정적 체인**을 완성했습니다.

```text
ScoreIR
  → zod schema 검증
  → 음악 규칙 검증 (12 rules, error/fatal 시 차단)
  → MusicXML 4.0 (결정적 직렬화)
  → Verovio 렌더링 (SVG + 고해상도 PNG)
  → 슬라이드 계획 (섹션 경계 우선 분할, 마디 미분할)
  → PPTX 생성 (PptxGenJS, PNG contain-fit · 잘림 0)
  → OOXML 구조 검증 (13개 검사)
  → 미리보기 PNG
```

`pnpm m1` 실행 시 [out/worship-score-sample.pptx](out/) (4 슬라이드)와
[out/assets/](out/assets/) (슬라이드별 PNG·SVG·MusicXML)가 생성되며, OOXML 검증 13개 항목이
모두 통과합니다. 렌더 결과에는 높은음자리표·박자표·멜로디 음표·마디선·한글 가사가 포함됩니다.

## 아키텍처

레이어: `Application → Domain → Provider Interfaces → Infrastructure Adapters`.
Domain(`core`)은 외부 엔진/SDK를 직접 import하지 않습니다.

| 패키지 | 역할 |
|---|---|
| [`@worship-score/core`](packages/core) | 도메인: ScoreIR 타입·zod 스키마, 음악 검증 규칙, MusicXML 4.0 직렬화, 발표 프로파일·슬라이드 계획, provider 인터페이스 |
| [`@worship-score/adapters`](packages/adapters) | 인프라 어댑터: Verovio 렌더러(WASM), resvg PNG 래스터라이저, PptxGenJS 빌더, OOXML 검증기 |
| [`@worship-score/pipeline`](packages/pipeline) | 재사용 빌드 엔진(`buildPresentation`) + Milestone 1 러너 + 고정 fixture |
| [`@worship-score/cli`](packages/cli) | 폴더-드롭 CLI (`pnpm ws …`) |
| [`@worship-score/web`](apps/web) | 출력 스타일 에디터 — 라이브 미리보기 + PPTX 내보내기 ([ADR-011](docs/worship-score/adr/ADR-011-web-stack-vanilla-server.md)) |

## 빠른 시작

```bash
pnpm install        # 의존성 설치 (Node >= 20, pnpm)
pnpm ws demo        # 데모 악보(코드+배경+전조) 생성 후 준비
pnpm ws build scores/demo   # → scores/demo/out/presentation.pptx 생성
pnpm web            # 스타일 에디터 서버 → http://localhost:4317
pnpm test           # vitest 전체
pnpm typecheck      # tsc 타입체크 (strict, NodeNext)
pnpm m1             # Milestone 1 결정적 체인 단독 실행 → out/
```

## 웹 스타일 에디터 (`pnpm web`)

`http://localhost:4317` 접속 → 곡 선택 → 옵션 편집 → 미리보기 → 내보내기.
**먼저 `pnpm ws demo`(또는 `ws analyze`/`ws init`)로 `scores/`에 곡을 만들어야** 목록에 뜹니다.

조절 항목: 악보 색·선 두께, 코드 표시, 조옮김, 레이아웃(한 줄 마디·한 장 줄 수),
배경 그림, 가독성 바탕, 제목/절-이름 타이포. **저장** 버튼으로 곡별 `options.json`에
보관해 다음 주에 그대로 불러옵니다. **내보내기**는 실제 PPTX를 받습니다.

미리보기는 브라우저에서 즉시 합성되고(스타일 변경은 서버 왕복 없음), 코드·조옮김·잉크색·
선두께·레이아웃만 서버에서 악보를 다시 렌더합니다([ADR-011](docs/worship-score/adr/ADR-011-web-stack-vanilla-server.md)).
기본은 인증 없는 **로컬 전용**(127.0.0.1) 도구입니다.

## 악보 → PPT 워크플로 (CLI)

폴더 하나 = 곡 하나 규약입니다 (`scores/<이름>/`).

```text
scores/<이름>/
  input.png | input.pdf      원본 악보 (선택)
  score.ir.json              분석 결과(ScoreIR) — 악보 분석으로 생성
  options.json               코드/키/배경/스타일 옵션
  background.png             공통 배경 이미지 (선택)
  out/presentation.pptx      생성된 악보 PPT
```

명령:

```bash
pnpm ws init scores/<이름>      # 새 곡 폴더 템플릿 생성
pnpm ws build scores/<이름>     # score.ir.json + options.json → PPT
pnpm ws validate scores/<이름>  # 음악 검증만
pnpm ws list                    # 곡 목록과 상태
```

`options.json` 예시 — **박자·음표·가사는 항상 고정**, 코드·키·배경·스타일은 선택:

```json
{
  "chords": { "visible": true },
  "key": { "transposeSemitones": 2 },
  "background": { "image": "background.png" },
  "style": {
    "title": { "fontFace": "Malgun Gothic", "fontSize": 28, "color": "FFFFFF", "bold": true },
    "sectionLabel": { "fontFace": "Malgun Gothic", "color": "E8ECF7" },
    "card": { "color": "FFFFFF", "opacity": 0.84 }
  }
}
```

- `chords.visible` — 코드 심볼 표시/숨김 (기본 숨김)
- `key.transposeSemitones` — 전조(반음 단위, 0 = 원조)
- `background.image` — 공통 배경 이미지(PNG/JPEG, 악보 폴더 안)
- `style.card` — 악보 뒤 가독성 카드 색상·불투명도(0~1)
- `style` — 제목/섹션 라벨의 폰트·크기·색상 (향후 웹 스타일 에디터가 편집할 표면)

> 입력은 모두 검증됩니다: 색상은 6자리 hex, 전조는 ±24, 배경 경로는 폴더 밖 차단(traversal),
> 배경 파일은 8MB 이하 + PNG/JPEG 매직바이트 확인.

> 악보 분석(`score.ir.json` 생성)은 현재 세션 내 분석으로 수행합니다. 자동 비전 OMR은
> `OMRProvider` 추상화 위에 추후 연결됩니다.

## 결정적성과 한계 (정직한 현황)

- **결정적(검증됨):** ScoreIR→MusicXML, ScoreIR→SVG/PNG는 동일 머신에서 결정적입니다.
- **미완/주의:**
  - PPTX의 **바이트 단위** 결정성은 아직 미보장(PptxGenJS가 생성 타임스탬프 삽입) — 정규화 예정.
  - 엄격한 **W3C MusicXML XSD** 검증은 미구현 — 현재는 구조 검증 + Verovio 라운드트립으로 대체.
  - 실제 **PowerPoint "수리 경고 없이 열기"** 라이브 테스트는 미실행(머신에 Office 없음) — 수동/CI 절차로 추적.
  - 가사 텍스트의 **크로스-머신 폰트** 결정성은 미보장(resvg 시스템 폰트) — 폰트 임베드 예정.

## 문서

설계·계획 문서는 [docs/worship-score/](docs/worship-score/)에 있습니다 — 저장소 평가서,
요구사항 추적표, 출시 차단 위험, 구현 계획(Milestone 1~9), 제3자 라이선스 리뷰, OMR 벤치마크,
그리고 ADR(`docs/worship-score/adr/`).

## 제3자 라이선스 (요약)

verovio (LGPL-3.0-or-later), @resvg/resvg-js (MPL-2.0), pptxgenjs (MIT), jszip (MIT 선택),
fast-xml-parser (MIT), zod (MIT). **Audiveris(AGPL-3.0)는 의존성에 추가하지 않았으며 법무 승인
전 프로덕션 경로 사용을 금지**합니다. 상세는 [THIRD_PARTY_LICENSE_REVIEW.md](docs/worship-score/THIRD_PARTY_LICENSE_REVIEW.md).

## 로드맵

M2 업로드/작업 파이프라인 · M3 OMR 기술검증 · M4 ScoreIR 영속화/불변 리비전 ·
M5 런타임 AI 검증 · M6 검수 UI · M7 발표 구성·템플릿·PPT · M8 조직 라이브러리 · M9 상업화.
자세한 내용은 [IMPLEMENTATION_PLAN.md](docs/worship-score/IMPLEMENTATION_PLAN.md).
