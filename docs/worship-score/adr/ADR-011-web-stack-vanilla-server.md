# ADR-011: Web stack — single tsx HTTP server + vanilla frontend (deviation from Next.js)

- **Status**: Accepted
- **Date**: 2026-06-16
- **Tags**: web, architecture, deviation

## Context

The PRD recommends Next.js 16 + Chakra UI 3 for the web surface. The first web
deliverable is an **output styling editor** (font / colour / typography with live
slide preview and PPTX export) — it does NOT edit the score itself.

Two forces push against the recommended stack:

1. **Engine integration friction.** The build engine (`buildPresentation`) depends
   on a Verovio WASM toolkit, `@resvg/resvg-js` (native addon), and PptxGenJS.
   Bundling these through a Next.js build (webpack/turbopack) alongside our
   source-only TS workspace packages (which export `./src/*.ts`) is fragile
   (`.js`→`.ts` extension resolution, native/WASM externalization, server runtime
   pinning). It would force a separate build pipeline for the engine packages.
2. **Design directive.** The user requires a dense, full-resolution, operational
   UI with restrained accents, **no card/callout UI**, no AI-generated-template
   look, and hover guidance written in end-user (non-developer) language. A
   component library (Chakra) pushes toward exactly the spacious, card-based look
   we must avoid.

## Decision

Build the web as a **single Node HTTP server run via `tsx`** (`@worship-score/web`),
serving a **hand-written vanilla HTML/CSS/JS frontend**. The server reuses the
existing TS engine on source (no build step), holds a singleton `VerovioRenderer`
injected into `buildPresentation` for fast previews, and serializes engine calls
with a mutex (Verovio's toolkit is stateful). API: list scores, preview (options →
slide PNGs), export (options → PPTX).

The styling editor edits **BuildOptions/StyleOptions only** (chords/key/background/
typography) — never the ScoreIR.

## Consequences

- No bundler/build for the web; engine source is reused directly (consistent with
  the CLI's tsx runtime). Single process: `pnpm web`.
- Full control over a dense, restrained, card-free UI and user-facing hover copy.
- Trade-off: no React/component ecosystem; richer interactivity is hand-built. If
  the web grows complex, revisit (a Next.js frontend talking to this same API
  remains possible — the API is framework-agnostic).
- Reaffirms the provider abstraction: the web injects renderer/builder; the engine
  stays framework-agnostic.

## Alternatives

- **Next.js + transpilePackages + serverExternalPackages**: rejected for now — real
  bundling friction with WASM/native + source TS packages, and the component-library
  pull conflicts with the design directive.
- **Two processes (Next front + tsx API)**: more moving parts for the user to run.
