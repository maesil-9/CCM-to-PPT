# 악보 분석 워크플로 (이미지/PDF → ScoreIR)

현재 OMR 런타임은 **세션 내 분석**입니다: 사용자가 악보 파일을 제공하면 Claude가 직접 읽어
`score.ir.json`(ScoreIR)을 작성하고, 그 뒤 결정적 빌드 체인이 PPT를 생성합니다. 자동 비전 OMR은
`OMRProvider` 추상화 위에 추후 연결됩니다(ADR-002).

## 전체 흐름

```text
1) 파일 제공        scores/<이름>/input.{pdf,png,jpg}  (또는 pnpm ws analyze <파일> [이름])
2) 분석            Claude가 input을 읽고 scores/<이름>/score.ir.json 작성
3) 옵션            scores/<이름>/options.json (코드/키/배경/스타일)
4) 빌드            pnpm ws build scores/<이름>  → out/presentation.pptx
```

`pnpm ws analyze <파일> [이름]` 은 입력을 폴더로 복사하고 `options.json` 템플릿을 만들어 줍니다.
그다음 세션에서 "이 악보 분석해줘"라고 요청하면 됩니다.

## 무엇을 추출하나

**고정(항상 포함)**: 박자(time), 음표(pitch+duration), 가사(lyrics).
**선택(옵션으로 토글)**: 코드(harmony), 키/전조(key) — `options.json`에서 제어. 코드는 ScoreIR에
저장하되 기본 숨김(OMR-004).

추출 항목:

- **metadata**: title, composer, lyricist, copyright, ccli, language("ko"/"en")
- **musicalContext**: `divisions`(=8, 사분음표당), `initialKey`{fifths,mode}, `initialTime`{beats,beatType},
  `initialClef`{sign,line}, `tempoBpm`
- **measures[]**: 각 마디의 `events[]`(note/rest), 첫 마디(또는 변경 시)의 `attributes`, `barlines`(반복/마침),
  필요 시 `harmonies[]`(코드)
- **note**: `pitch`{step:A–G, alter:-2..2, octave}, `duration`{type:whole|half|quarter|eighth|16th|32nd, dots},
  `tie`{start,stop}, `lyrics`[{verse,text,syllabic:single|begin|middle|end, extend?}]
- **sections[]**: intro/verse/preChorus/chorus/bridge/interlude/tag/ending/custom + start/end 마디
- **presentation.order[]**: 절·후렴 진행 순서(섹션 + verse 번호 + 반복)

## 규칙과 검증

- `divisions = 8`(사분음표당)을 쓰면 16분음표·점음표까지 정수로 표현됩니다.
- 한 마디의 음표/쉼표 길이 합 = 박자 용량(예: 4/4 → 32). 어긋나면 `MEASURE_DURATION_MATCH` 오류.
- 타이는 같은 음높이끼리, 시작/끝이 짝을 이뤄야 합니다(`TIE_*`).
- 코드 `offsetDivisions`는 마디 용량 안이어야 합니다(`HARMONY_OFFSET_IN_RANGE`).
- 작성 후 `pnpm ws validate scores/<이름>` 으로 검증하세요. **error/fatal이 있으면 PPT를 생성하지 않습니다.**
- 확신하지 못하는 음표/가사를 임의로 확정하지 않습니다(PRD §5.1). 최선의 판독을 작성하고 검증·검수로 보정합니다.

## 최소 예시 (4/4, C major, 1마디)

```json
{
  "scoreId": "my-song",
  "schemaVersion": "scoreir-0.1.0",
  "metadata": { "title": "예시", "language": "ko" },
  "musicalContext": {
    "divisions": 8,
    "initialKey": { "fifths": 0, "mode": "major" },
    "initialTime": { "beats": 4, "beatType": 4 },
    "initialClef": { "sign": "G", "line": 2 }
  },
  "parts": [{ "id": "P1", "name": "Melody", "staffCount": 1 }],
  "measures": [
    {
      "id": "m1", "number": 1, "index": 0,
      "attributes": {
        "divisions": 8,
        "key": { "fifths": 0, "mode": "major" },
        "time": { "beats": 4, "beatType": 4 },
        "clef": { "sign": "G", "line": 2 }
      },
      "events": [
        { "id": "m1-n1", "kind": "note", "measureId": "m1", "voice": 1, "staff": 1,
          "pitch": { "step": "C", "octave": 4 }, "duration": { "type": "quarter", "dots": 0 },
          "lyrics": [{ "verse": 1, "text": "주", "syllabic": "single" }] }
      ],
      "harmonies": [{ "id": "m1-h1", "offsetDivisions": 0, "root": { "step": "C" }, "kind": "major" }]
    }
  ],
  "sections": [{ "id": "s1", "kind": "verse", "label": "Verse", "startMeasureId": "m1", "endMeasureId": "m1" }],
  "sourceRegions": [],
  "uncertainties": [],
  "presentation": {
    "chordVisibility": "hidden",
    "order": [{ "id": "p1", "sectionId": "s1", "verse": 1, "label": "Verse 1" }]
  }
}
```

전체 스키마는 `pnpm ws schema` → `docs/worship-score/scoreir.schema.json` 으로 내보낼 수 있습니다.

## 분석 후 자가검수 체크리스트 (필수)

작성한 `score.ir.json`을 빌드 전에 다음으로 점검합니다(`pnpm ws validate scores/<이름>`은 기계 검증).

- [ ] 마디 수 = 원본 악보의 마디 수
- [ ] 조표·박자·음자리표가 원본과 일치
- [ ] 각 마디의 음표/쉼표 길이 합 = 박자 용량(못갖춘마디는 예외)
- [ ] 절별 가사 음절 수 = 해당 절 가사가 붙는 음표 수
- [ ] 타이는 같은 음높이끼리, 시작/끝이 짝을 이룸
- [ ] 반복(도돌이)·1/2번 괄호 구조가 원본과 일치
- [ ] 코드 위치(offsetDivisions)가 마디 안
- [ ] 섹션(절/후렴) 경계와 발표 순서(presentation.order)가 의도대로

## 불확실성 기록 (그럴듯하지만 틀린 음 방지)

판독에 확신이 없는 음표/가사는 **임의로 확정하지 말고** `uncertainties[]`에 기록합니다(PRD §5.1).

```json
{ "id": "u1", "entityId": "m12-n3", "field": "duration.type", "severity": "high",
  "status": "open", "candidates": [
    { "value": "quarter", "confidence": 0.55, "source": "manual" },
    { "value": "eighth",  "confidence": 0.45, "source": "manual" }],
  "validationFailures": [] }
```

## 잇단음표(셋잇단 등)

셋잇단음표가 있으면 `musicalContext.divisions`(및 첫 마디 attributes.divisions)를 **24**로 두고,
해당 음표에 `duration.timeModification = { actualNotes: 3, normalNotes: 2 }`와
`tuplet: { start, stop }`을 설정합니다(divisions가 3으로 나눠떨어져야 정수 음가 유지).
