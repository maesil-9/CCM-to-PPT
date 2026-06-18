// WorshipScore styling editor — client. Style changes compose instantly in the
// browser (mirroring the PPTX layout); only chord/transpose changes re-render the
// score on the server.

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.35;
const CARD_PAD = 0.18;
// Projection geometry (must mirror packages/adapters pptx builder AND the
// PROJECTION_PRESENTATION_PROFILE safeMargin of 0.4 so preview == export).
const SUB_MARGIN = 0.4;
const SUB_CHROME = SUB_MARGIN * 0.5 + 0.55 + 0.12; // title/section row bottom
const FONTS = ["Malgun Gothic", "Noto Sans KR", "Pretendard", "Segoe UI", "Arial", "Georgia", "Times New Roman"];

const $ = (id) => document.getElementById(id);
const state = { id: null, hasBackground: false, slides: [], bgVersion: 0 };
let lastRenderKey = null;
let renderTimer = null;

function pctX(v) {
  return (v / SLIDE_W) * 100;
}
function pctY(v) {
  return (v / SLIDE_H) * 100;
}
function ptToCqw(pt) {
  return pt * (7.5 / 72); // 1 inch = 7.5cqw of a 13.333" slide
}
function toHex(inputValue) {
  return inputValue.replace("#", "").toUpperCase();
}
function setColor(el, hex) {
  el.value = "#" + (hex || "FFFFFF").toLowerCase();
}
function clampInt(v, lo, hi) {
  const n = Math.round(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}

function fitContain(imgW, imgH, box) {
  if (imgW <= 0 || imgH <= 0) return box;
  const scale = Math.min(box.w / imgW, box.h / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function populateFonts() {
  for (const sel of [$("title-font"), $("label-font"), $("lyric-font")]) {
    sel.innerHTML = "";
    for (const f of FONTS) {
      const o = document.createElement("option");
      o.value = f;
      o.textContent = f;
      sel.appendChild(o);
    }
  }
  $("title-font").value = "Pretendard";
  $("label-font").value = "Pretendard";
  $("lyric-font").value = "Pretendard";
}

function readOptions() {
  const bgOn = $("bg-enabled").checked && state.hasBackground;
  const style = {
    title: {
      fontFace: $("title-font").value,
      fontSize: clampInt($("title-size").value, 8, 80),
      color: toHex($("title-color").value),
      bold: $("title-bold").checked,
    },
    sectionLabel: {
      fontFace: $("label-font").value,
      fontSize: clampInt($("label-size").value, 8, 60),
      color: toHex($("label-color").value),
      bold: $("label-bold").checked,
    },
    card: { color: toHex($("card-color").value), opacity: parseFloat($("card-opacity").value) },
    textShadow: $("text-shadow").checked,
  };
  if (!bgOn) style.backgroundColor = toHex($("bg-color").value);
  const o = {
    chords: { visible: $("chords-visible").checked },
    tempo: { visible: $("tempo-visible").checked },
    measureNumbers: { visible: $("measure-numbers").checked },
    partName: { visible: $("part-name").checked },
    key: { transposeSemitones: clampInt($("transpose").value, -12, 12) },
    layout: {
      mode: $("layout-mode").value === "leadsheet" ? "leadsheet" : "projection",
      lyricSize: parseFloat($("lyric-size").value),
      measuresPerSystem: clampInt($("measures-per-system").value, 1, 4),
      maxSystemsPerSlide: clampInt($("max-systems").value, 1, 6),
    },
    score: {
      inkColor: toHex($("ink-color").value),
      lineThickness: parseFloat($("line-thickness").value),
      lyricFont: $("lyric-font").value,
      lyricBold: $("lyric-bold").checked,
      lyricColor: toHex($("lyric-color").value),
      lyricOutlineColor: toHex($("lyric-outline-color").value),
      lyricOutlineWidth: parseFloat($("lyric-outline-width").value),
      lyricShadow: $("lyric-shadow").checked,
      lyricGap: parseFloat($("lyric-gap").value),
    },
    style,
  };
  if (bgOn) o.backgroundEnabled = true;
  return o;
}

function applyOptions(ui) {
  $("chords-visible").checked = !!ui.chords?.visible;
  $("tempo-visible").checked = ui.tempo?.visible !== false;
  $("measure-numbers").checked = !!ui.measureNumbers?.visible;
  $("part-name").checked = !!ui.partName?.visible;
  $("text-shadow").checked = !!ui.style?.textShadow;
  $("transpose").value = String(ui.key?.transposeSemitones ?? 0);
  $("bg-enabled").checked = !!ui.backgroundEnabled;
  $("layout-mode").value = ui.layout?.mode === "leadsheet" ? "leadsheet" : "projection";
  if (ui.layout?.lyricSize) $("lyric-size").value = String(ui.layout.lyricSize);
  if (ui.style?.title) {
    if (ui.style.title.fontFace) $("title-font").value = ui.style.title.fontFace;
    if (ui.style.title.fontSize) $("title-size").value = String(ui.style.title.fontSize);
    if (ui.style.title.color) setColor($("title-color"), ui.style.title.color);
    $("title-bold").checked = ui.style.title.bold !== false;
  }
  if (ui.style?.sectionLabel) {
    if (ui.style.sectionLabel.fontFace) $("label-font").value = ui.style.sectionLabel.fontFace;
    if (ui.style.sectionLabel.fontSize) $("label-size").value = String(ui.style.sectionLabel.fontSize);
    if (ui.style.sectionLabel.color) setColor($("label-color"), ui.style.sectionLabel.color);
    $("label-bold").checked = ui.style.sectionLabel.bold !== false;
  }
  if (ui.style?.card) {
    if (ui.style.card.color) setColor($("card-color"), ui.style.card.color);
    if (ui.style.card.opacity != null) $("card-opacity").value = String(ui.style.card.opacity);
  }
  if (ui.style?.backgroundColor) setColor($("bg-color"), ui.style.backgroundColor);
  if (ui.score) {
    if (ui.score.inkColor) setColor($("ink-color"), ui.score.inkColor);
    if (ui.score.lineThickness != null) $("line-thickness").value = String(ui.score.lineThickness);
    if (ui.score.lyricFont) $("lyric-font").value = ui.score.lyricFont;
    $("lyric-bold").checked = !!ui.score.lyricBold;
    if (ui.score.lyricColor) setColor($("lyric-color"), ui.score.lyricColor);
    if (ui.score.lyricOutlineColor) setColor($("lyric-outline-color"), ui.score.lyricOutlineColor);
    if (ui.score.lyricOutlineWidth != null) $("lyric-outline-width").value = String(ui.score.lyricOutlineWidth);
    $("lyric-shadow").checked = !!ui.score.lyricShadow;
    if (ui.score.lyricGap != null) $("lyric-gap").value = String(ui.score.lyricGap);
  }
  if (ui.layout) {
    if (ui.layout.measuresPerSystem) $("measures-per-system").value = String(ui.layout.measuresPerSystem);
    if (ui.layout.maxSystemsPerSlide) $("max-systems").value = String(ui.layout.maxSystemsPerSlide);
  }
  syncBgState();
  syncModeUI();
}

function syncBgState() {
  $("bg-enabled").disabled = !state.hasBackground;
  if (!state.hasBackground) $("bg-enabled").checked = false;
  $("bg-color").disabled = $("bg-enabled").checked;
}

// Show only the layout controls that apply to the chosen format.
function syncModeUI() {
  const projection = $("layout-mode").value !== "leadsheet";
  $("row-lyric-size").style.display = projection ? "" : "none";
  $("row-measures").style.display = projection ? "none" : "";
}

function renderKeyOf(o) {
  // Anything that changes the rendered score image triggers a server re-render.
  return [
    o.chords.visible,
    o.tempo.visible,
    o.measureNumbers.visible,
    o.partName.visible,
    o.key.transposeSemitones,
    o.score.inkColor,
    o.score.lineThickness,
    o.score.lyricFont,
    o.score.lyricBold,
    o.score.lyricColor,
    o.score.lyricOutlineColor,
    o.score.lyricOutlineWidth,
    o.score.lyricShadow,
    o.score.lyricGap,
    o.layout.mode,
    o.layout.lyricSize,
    o.layout.measuresPerSystem,
    o.layout.maxSystemsPerSlide,
  ].join("|");
}

function setStatus(text, cls) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (cls ? " " + cls : "");
}

function updateValidation(v, ooxmlOk) {
  const blocking = v.issues.filter((i) => i.severity === "error" || i.severity === "fatal").length;
  const warn = v.issues.filter((i) => i.severity === "warning").length;
  if (blocking > 0) {
    setStatus(`검증: 오류 ${blocking}건 — 내보낼 수 없습니다`, "err");
    $("export").disabled = true;
  } else if (ooxmlOk === false) {
    setStatus("파일 구조 검증 실패 — 내보낼 수 없습니다", "err");
    $("export").disabled = true;
  } else {
    setStatus(`검증: 통과${warn ? ` · 주의 ${warn}건` : ""}`, "ok");
    $("export").disabled = false;
  }
}

function computeLayout(s, compact) {
  const hasTitle = !!s.title;
  const hasSection = !!s.sectionLabel;
  const innerW = SLIDE_W - 2 * MARGIN;
  let contentTop = MARGIN;
  let titleRect = null;
  let sectionRect = null;
  if (compact) {
    // Projection: small ♪ title top-left, section top-right; the full engraving
    // (staff + lyrics under the notes) then fills the rest of the slide, large.
    const subInnerW = SLIDE_W - 2 * SUB_MARGIN;
    const rowY = SUB_MARGIN * 0.5;
    const rowH = 0.55;
    if (hasTitle) titleRect = { x: SUB_MARGIN, y: rowY, w: subInnerW * 0.66, h: rowH };
    if (hasSection) sectionRect = { x: SUB_MARGIN + subInnerW * 0.66, y: rowY, w: subInnerW * 0.34, h: rowH };
    const box = { x: SUB_MARGIN, y: SUB_CHROME, w: subInnerW, h: SLIDE_H - SUB_CHROME - SUB_MARGIN };
    // ONE global scale across the whole deck → identical staff/note size on every
    // slide. Each line keeps its natural width (left-aligned), centred vertically.
    const gScale = Math.min(
      ...state.slides.map((sl) => Math.min(box.w / (sl.widthPx || 16), box.h / (sl.heightPx || 9))),
    );
    const w = (s.widthPx || 16) * gScale;
    const h = (s.heightPx || 9) * gScale;
    const fit = { x: box.x, y: box.y + (box.h - h) / 2, w, h };
    return { titleRect, sectionRect, fit, card: null };
  }
  {
    if (hasTitle) {
      titleRect = { x: MARGIN, y: MARGIN * 0.5, w: innerW, h: 0.7 };
      contentTop = MARGIN * 0.5 + 0.8;
    }
    if (hasSection) {
      sectionRect = { x: MARGIN, y: contentTop, w: innerW, h: 0.4 };
      contentTop += 0.55;
    }
  }
  const box = { x: MARGIN, y: contentTop, w: innerW, h: SLIDE_H - contentTop - MARGIN };
  const fit = fitContain(s.widthPx || 16, s.heightPx || 9, box);
  const cardX = Math.max(box.x, fit.x - CARD_PAD);
  const cardY = Math.max(box.y, fit.y - CARD_PAD);
  const cardR = Math.min(box.x + box.w, fit.x + fit.w + CARD_PAD);
  const cardB = Math.min(box.y + box.h, fit.y + fit.h + CARD_PAD);
  return { titleRect, sectionRect, fit, card: { x: cardX, y: cardY, w: cardR - cardX, h: cardB - cardY } };
}

function place(el, r) {
  el.style.left = pctX(r.x) + "%";
  el.style.top = pctY(r.y) + "%";
  el.style.width = pctX(r.w) + "%";
  el.style.height = pctY(r.h) + "%";
}

function compose() {
  const ui = readOptions();
  const compact = ui.layout.mode === "projection";
  const preview = $("preview");
  preview.innerHTML = "";
  if (state.slides.length === 0) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "미리볼 슬라이드가 없습니다.";
    preview.appendChild(e);
    return;
  }
  const bgUrl = ui.backgroundEnabled
    ? `/api/scores/${encodeURIComponent(state.id)}/background?v=${state.bgVersion}`
    : null;
  const shadow = ui.style.textShadow ? "0 2px 4px rgba(0,0,0,0.55)" : "none";

  for (const s of state.slides) {
    const L = computeLayout(s, compact);
    const wrap = document.createElement("div");
    wrap.className = "slide-wrap";

    const meta = document.createElement("div");
    meta.className = "slide-meta";
    meta.textContent = `${s.index + 1}. ${s.sectionLabel ?? ""}${s.verse ? " · " + s.verse + "절" : ""}`.trim();
    wrap.appendChild(meta);

    const slide = document.createElement("div");
    slide.className = "slide";
    slide.style.background = bgUrl ? "#000" : "#" + (ui.style.backgroundColor || "FFFFFF");

    if (bgUrl) {
      const bg = document.createElement("div");
      bg.className = "slide-bg";
      bg.style.backgroundImage = `url("${bgUrl}")`;
      slide.appendChild(bg);
    }

    if (ui.style.card.opacity > 0) {
      const card = document.createElement("div");
      card.className = "slide-card";
      place(card, L.card);
      card.style.background = "#" + ui.style.card.color;
      card.style.opacity = String(ui.style.card.opacity);
      slide.appendChild(card);
    }

    if (s.png) {
      const img = document.createElement("img");
      img.className = "slide-score";
      img.alt = (s.title || s.sectionLabel ? `${s.title ?? ""} ${s.sectionLabel ?? ""} 악보`.trim() : `슬라이드 ${s.index + 1} 악보`);
      img.src = "data:image/png;base64," + s.png;
      place(img, L.fit);
      slide.appendChild(img);
    }

    if (L.titleRect && s.title) {
      const t = document.createElement("div");
      t.className = "slide-text slide-title";
      place(t, L.titleRect);
      t.textContent = compact ? "♪ " + s.title : s.title;
      t.style.fontFamily = ui.style.title.fontFace;
      t.style.fontSize = ptToCqw(ui.style.title.fontSize).toFixed(3) + "cqw";
      t.style.color = "#" + ui.style.title.color;
      t.style.fontWeight = ui.style.title.bold ? "700" : "400";
      t.style.justifyContent = compact ? "flex-start" : "center";
      t.style.textShadow = shadow;
      slide.appendChild(t);
    }

    if (L.sectionRect && s.sectionLabel) {
      const sec = document.createElement("div");
      sec.className = "slide-text";
      place(sec, L.sectionRect);
      sec.textContent = s.sectionLabel;
      sec.style.fontFamily = ui.style.sectionLabel.fontFace;
      sec.style.fontSize = ptToCqw(ui.style.sectionLabel.fontSize).toFixed(3) + "cqw";
      sec.style.color = "#" + ui.style.sectionLabel.color;
      sec.style.fontWeight = ui.style.sectionLabel.bold === false ? "400" : "700";
      sec.style.justifyContent = compact ? "flex-end" : "flex-start";
      sec.style.textShadow = shadow;
      slide.appendChild(sec);
    }

    wrap.appendChild(slide);
    preview.appendChild(wrap);
  }
}

async function serverRender() {
  if (!state.id) return;
  const opts = readOptions();
  setStatus("렌더 중…");
  $("preview").setAttribute("aria-busy", "true");
  try {
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scoreId: state.id, options: opts }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "미리보기 실패");
    state.slides = data.slides;
    lastRenderKey = renderKeyOf(opts);
    updateValidation(data.validation, data.ooxmlOk);
    compose();
  } catch (e) {
    setStatus("오류: " + e.message, "err");
  } finally {
    $("preview").setAttribute("aria-busy", "false");
  }
}

function onAnyChange() {
  syncBgState();
  syncModeUI();
  const opts = readOptions();
  if (renderKeyOf(opts) !== lastRenderKey) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(serverRender, 250);
  } else {
    compose();
  }
}

async function loadScore(id) {
  state.id = id;
  const summary = state._scores?.find((x) => x.id === id);
  state.hasBackground = !!summary?.hasBackground;
  const res = await fetch(`/api/scores/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok) {
    setStatus("오류: " + (data.error || "불러오기 실패"), "err");
    return;
  }
  applyOptions(data.options || {});
  lastRenderKey = null;
  await serverRender();
}

async function exportPptx() {
  if (!state.id) return;
  const btn = $("export");
  btn.disabled = true;
  setStatus("내보내는 중…");
  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scoreId: state.id, options: readOptions() }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "내보내기 실패");
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = state.id + ".pptx";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("내보냄 ✓", "ok");
  } catch (e) {
    setStatus("오류: " + e.message, "err");
  } finally {
    btn.disabled = false;
  }
}

async function uploadBackground(file) {
  if (!state.id || !file) return;
  setStatus("배경 올리는 중…");
  try {
    const buf = await file.arrayBuffer();
    const res = await fetch(`/api/scores/${encodeURIComponent(state.id)}/background`, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: buf,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "업로드 실패");
    }
    state.hasBackground = true;
    state.bgVersion++;
    $("bg-enabled").checked = true;
    syncBgState();
    compose();
    setStatus("배경 적용됨 ✓", "ok");
  } catch (e) {
    setStatus("오류: " + e.message, "err");
  }
}

async function removeBackground() {
  if (!state.id) return;
  try {
    const res = await fetch(`/api/scores/${encodeURIComponent(state.id)}/background`, { method: "DELETE" });
    if (!res.ok) throw new Error("제거 실패");
    state.hasBackground = false;
    $("bg-enabled").checked = false;
    syncBgState();
    compose();
    setStatus("배경 제거됨", "ok");
  } catch (e) {
    setStatus("오류: " + e.message, "err");
  }
}

// System default preset: the worship-slide look (white outlined lyrics, heavier
// ink, navy title, tempo hidden) — mirrors scores/saenggi-ya/options.json. Per-
// score values (background, transpose) are intentionally left at their neutral
// state, not part of the preset.
function resetDefaults() {
  setColor($("ink-color"), "1A1A1A");
  $("line-thickness").value = "1.7";
  $("lyric-font").value = "Pretendard";
  $("lyric-bold").checked = true;
  setColor($("lyric-color"), "FFFFFF");
  setColor($("lyric-outline-color"), "000000");
  $("lyric-outline-width").value = "12";
  $("lyric-shadow").checked = false;
  $("lyric-gap").value = "8";
  $("layout-mode").value = "projection";
  $("lyric-size").value = "8";
  $("chords-visible").checked = false;
  $("tempo-visible").checked = false;
  $("measure-numbers").checked = false;
  $("part-name").checked = false;
  $("text-shadow").checked = false;
  $("transpose").value = "0";
  $("measures-per-system").value = "2";
  $("max-systems").value = "2";
  $("bg-enabled").checked = false;
  setColor($("bg-color"), "FFFFFF");
  setColor($("card-color"), "FFFFFF");
  $("card-opacity").value = "0";
  $("title-font").value = "Pretendard";
  $("title-size").value = "24";
  setColor($("title-color"), "2A3A66");
  $("title-bold").checked = true;
  $("label-font").value = "Pretendard";
  $("label-size").value = "18";
  setColor($("label-color"), "555555");
  $("label-bold").checked = true;
  onAnyChange();
}

async function saveOptions() {
  if (!state.id) return;
  const btn = $("save");
  btn.disabled = true;
  try {
    const res = await fetch(`/api/scores/${encodeURIComponent(state.id)}/options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ options: readOptions() }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "저장 실패");
    }
    setStatus("저장됨 ✓", "ok");
  } catch (e) {
    setStatus("오류: " + e.message, "err");
  } finally {
    btn.disabled = false;
  }
}

function initTooltip() {
  const tip = $("tooltip");
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-hint]");
    if (!el) return;
    tip.textContent = el.getAttribute("data-hint");
    tip.hidden = false;
  });
  document.addEventListener("mousemove", (e) => {
    if (tip.hidden) return;
    const x = Math.min(e.clientX + 14, window.innerWidth - 260);
    const y = Math.min(e.clientY + 16, window.innerHeight - 60);
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest("[data-hint]")) tip.hidden = true;
  });
  // Keyboard access: show the hint on focus, hide on blur / Escape.
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest?.("[data-hint]");
    if (!el) return;
    tip.textContent = el.getAttribute("data-hint");
    const r = el.getBoundingClientRect();
    tip.style.left = Math.min(r.left, window.innerWidth - 260) + "px";
    tip.style.top = Math.min(r.bottom + 6, window.innerHeight - 60) + "px";
    tip.hidden = false;
  });
  document.addEventListener("focusout", () => {
    tip.hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") tip.hidden = true;
  });
}

async function init() {
  populateFonts();
  initTooltip();

  document.querySelector(".controls").addEventListener("input", onAnyChange);
  document.querySelector(".controls").addEventListener("change", onAnyChange);
  $("transpose-down").addEventListener("click", () => stepTranspose(-1));
  $("transpose-up").addEventListener("click", () => stepTranspose(1));
  $("export").addEventListener("click", exportPptx);
  $("save").addEventListener("click", saveOptions);
  $("reset").addEventListener("click", resetDefaults);
  $("bg-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) uploadBackground(f);
    e.target.value = "";
  });
  $("bg-remove").addEventListener("click", removeBackground);
  $("score-select").addEventListener("change", (e) => loadScore(e.target.value));

  const res = await fetch("/api/scores");
  const scores = await res.json();
  state._scores = scores;
  const sel = $("score-select");
  sel.innerHTML = "";
  for (const s of scores) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.title || s.id;
    sel.appendChild(o);
  }
  if (scores.length === 0) {
    setStatus("scores/ 폴더에 분석된 곡이 없습니다.", "err");
    return;
  }
  await loadScore(scores[0].id);
}

function stepTranspose(delta) {
  $("transpose").value = String(clampInt(Number($("transpose").value) + delta, -12, 12));
  onAnyChange();
}

init();
