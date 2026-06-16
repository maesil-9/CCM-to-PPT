/**
 * VerovioRenderer — RendererProvider backed by the Verovio toolkit (WASM) for
 * MusicXML -> SVG, with @resvg/resvg-js for SVG -> PNG.
 *
 * The PRD requires SVG-first output with a mandatory high-resolution PNG
 * compatibility mode (RND-002, PPT-002). Verovio embeds its music font as
 * vector paths, so the SVG geometry is deterministic for a given input. Lyric/
 * chord TEXT is rasterized via resvg; for cross-machine deterministic text,
 * pass `fontFiles` (system fonts are then disabled).
 *
 * For one slide the PNG path also returns the SVG, so a caller needs only one
 * Verovio loadData to get both assets.
 */
import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";
import { Resvg, type ResvgRenderOptions } from "@resvg/resvg-js";
import type {
  ProviderHealth,
  RenderedPage,
  RendererProvider,
  RenderOptions,
  RenderScoreInput,
  RenderScoreResult,
  RenderSystemInput,
  RenderSystemResult,
} from "@worship-score/core";

const PROVIDER_NAME = "verovio";
const BASE_SCALE = 50;

/** FNV-1a 32-bit hash → 8-hex chars. Deterministic run ids (no RNG/clock). */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function buildVerovioOptions(options?: RenderOptions): Record<string, unknown> {
  return {
    // minStaffSize acts as a scale floor so larger requests grow the staff.
    scale: Math.max(BASE_SCALE, options?.minStaffSize ?? 0),
    pageWidth: options?.pageWidth ?? 2400,
    pageHeight: options?.pageHeight ?? 60000,
    adjustPageHeight: options?.adjustPageHeight ?? true,
    pageMarginTop: 60,
    pageMarginBottom: 60,
    pageMarginLeft: 60,
    pageMarginRight: 60,
    breaks: "auto",
    header: "none",
    footer: "none",
    svgViewBox: true,
    ...(options?.lineThickness
      ? {
          staffLineWidth: 0.15 * options.lineThickness,
          stemWidth: 0.2 * options.lineThickness,
          barLineWidth: 0.3 * options.lineThickness,
        }
      : {}),
    ...(options?.rendererOptions ?? {}),
  };
}

/**
 * Recolours the whole engraving. Verovio's definition-scale `<svg>` carries
 * `color="black"` and its stylesheet sets `stroke: currentColor` (staff lines,
 * stems, barlines) — but NOT fill, so filled glyphs (noteheads, clef, lyrics)
 * stay black. We point `color` at the ink AND add `fill="currentColor"` on the
 * root so fill inherits down to glyphs and text too.
 */
function recolorSvg(svg: string, inkColor: string | undefined): string {
  if (!inkColor) return svg;
  return svg
    .replace('color="black"', `color="#${inkColor}"`)
    .replace('class="definition-scale"', 'class="definition-scale" fill="currentColor"');
}

function resvgFontConfig(options?: RenderOptions): ResvgRenderOptions["font"] {
  if (options?.fontFiles && options.fontFiles.length > 0) {
    return {
      loadSystemFonts: false,
      fontFiles: options.fontFiles,
      ...(options.textFontFamily ? { defaultFontFamily: options.textFontFamily } : {}),
    };
  }
  return {
    loadSystemFonts: true,
    ...(options?.textFontFamily ? { defaultFontFamily: options.textFontFamily } : {}),
  };
}

function svgPixelSize(svg: string): { width: number; height: number } {
  const w = /<svg[^>]*\bwidth="([\d.]+)(?:px)?"/.exec(svg);
  const h = /<svg[^>]*\bheight="([\d.]+)(?:px)?"/.exec(svg);
  if (w?.[1] && h?.[1]) {
    return { width: Math.round(parseFloat(w[1])), height: Math.round(parseFloat(h[1])) };
  }
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (vb?.[1] && vb[2]) {
    return { width: Math.round(parseFloat(vb[1])), height: Math.round(parseFloat(vb[2])) };
  }
  return { width: 0, height: 0 };
}

export class VerovioRenderer implements RendererProvider {
  readonly providerName = PROVIDER_NAME;
  readonly providerVersion: string;
  private readonly toolkit: VerovioToolkit;

  private constructor(toolkit: VerovioToolkit) {
    this.toolkit = toolkit;
    let version = "unknown";
    try {
      version = toolkit.getVersion();
    } catch {
      version = "6.x";
    }
    this.providerVersion = version;
  }

  /** Loads the WASM module and returns a ready-to-use renderer. */
  static async create(): Promise<VerovioRenderer> {
    const module = await createVerovioModule();
    const toolkit = new VerovioToolkit(module);
    return new VerovioRenderer(toolkit);
  }

  async renderScore(input: RenderScoreInput): Promise<RenderScoreResult> {
    const runId = `${PROVIDER_NAME}-${shortHash(input.musicXml + "|" + input.outputMode)}`;
    this.toolkit.setOptions(buildVerovioOptions(input.options));

    const loaded = this.toolkit.loadData(input.musicXml);
    if (!loaded) {
      throw new Error("Verovio failed to load MusicXML (invalid or unsupported input)");
    }

    const pageCount = this.toolkit.getPageCount();
    if (pageCount < 1) {
      throw new Error("Verovio produced no pages from the given MusicXML");
    }
    // A single slide must be exactly one page; more means content overflowed and
    // we would silently drop measures. Fail loudly instead (PRD §5.5).
    if (pageCount > 1) {
      throw new Error(
        `Verovio paginated this render into ${pageCount} pages; the slide's content does not fit one page. Reduce measures per slide or increase page size.`,
      );
    }

    const svg = recolorSvg(this.toolkit.renderToSVG(1), input.options?.inkColor);
    const pages: RenderedPage[] = [];

    if (input.outputMode === "svg") {
      const size = svgPixelSize(svg);
      pages.push({ index: 0, svg, widthPx: size.width, heightPx: size.height });
    } else {
      const rasterScale = input.options?.scale ?? 2;
      const resvg = new Resvg(svg, {
        background: "white",
        fitTo: { mode: "zoom", value: rasterScale },
        font: resvgFontConfig(input.options),
      });
      const rendered = resvg.render();
      pages.push({
        index: 0,
        svg, // included so callers get both assets from one loadData
        png: new Uint8Array(rendered.asPng()),
        widthPx: rendered.width,
        heightPx: rendered.height,
      });
    }

    return {
      providerName: this.providerName,
      providerVersion: this.providerVersion,
      runId,
      outputMode: input.outputMode,
      pages,
    };
  }

  async renderSystem(input: RenderSystemInput): Promise<RenderSystemResult> {
    return this.renderScore(input);
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const probe =
        '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0">' +
        '<part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>' +
        '<part id="P1"><measure number="1"><attributes><divisions>1</divisions>' +
        "<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>" +
        "<clef><sign>G</sign><line>2</line></clef></attributes>" +
        "<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>" +
        "</measure></part></score-partwise>";
      const ok = this.toolkit.loadData(probe) && this.toolkit.getPageCount() >= 1;
      return {
        ok,
        providerName: this.providerName,
        providerVersion: this.providerVersion,
        ...(ok ? {} : { detail: "probe render failed" }),
      };
    } catch (err) {
      return {
        ok: false,
        providerName: this.providerName,
        providerVersion: this.providerVersion,
        detail: (err as Error).message,
      };
    }
  }

  dispose(): void {
    // The Verovio JS binding exposes no explicit free; the toolkit and its WASM
    // heap are released with the instance on GC. Present for interface symmetry.
  }
}
