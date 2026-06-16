# 악보 폴더

이 폴더에 악보 한 곡을 담습니다.

1. `input.png` (또는 .pdf/.jpg): 원본 악보 파일을 넣습니다(선택).
2. `score.ir.json`: 악보를 분석한 결과(ScoreIR). 분석으로 생성됩니다.
3. `options.json`: 코드/키/배경/스타일 옵션.
4. `background.png`: 공통 배경 이미지(선택).

빌드: 루트에서 `pnpm ws build scores/<이름>`
검증: `pnpm ws validate scores/<이름>`
결과: `out/presentation.pptx`
