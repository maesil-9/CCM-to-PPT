import { describe, expect, it } from "vitest";
import { VerovioRenderer, VerovioRendererPool } from "@worship-score/adapters";

const TIMEOUT = 60_000;

/** Minimal valid MusicXML 4.0 with a single whole note of the given step. */
function score(step: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0">' +
    '<part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>' +
    '<part id="P1"><measure number="1"><attributes><divisions>1</divisions>' +
    "<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>" +
    "<clef><sign>G</sign><line>2</line></clef></attributes>" +
    `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>` +
    "</measure></part></score-partwise>"
  );
}

describe("VerovioRendererPool", () => {
  it("renders byte-identically to the single renderer (drop-in, deterministic)", async () => {
    const single = await VerovioRenderer.create();
    const pool = await VerovioRendererPool.create(2);
    try {
      const xml = score("C");
      const a = await single.renderScore({ musicXml: xml, outputMode: "png" });
      const b = await pool.renderScore({ musicXml: xml, outputMode: "png" });
      const pa = a.pages[0]?.png;
      const pb = b.pages[0]?.png;
      // PNG is byte-identical — the meaningful drop-in guarantee (this is what
      // the build embeds). The SVG only differs by Verovio's per-instance random
      // element id, so compare it with ids normalized away.
      // PNG byte-equality is the drop-in guarantee (this is what the build
      // embeds). SVGs only differ by Verovio's per-instance id salts, so assert
      // structural equivalence: identical viewBox and path count.
      expect(pa && pb && Buffer.from(pb).equals(Buffer.from(pa))).toBe(true);
      const svgA = a.pages[0]?.svg ?? "";
      const svgB = b.pages[0]?.svg ?? "";
      const viewBox = (s: string) => s.match(/viewBox="([^"]+)"/)?.[1];
      const pathCount = (s: string) => (s.match(/<path /g) ?? []).length;
      expect(viewBox(svgB)).toBe(viewBox(svgA));
      expect(pathCount(svgB)).toBe(pathCount(svgA));
      expect(svgB).toContain("Engraved by Verovio");
      // The result carries the underlying renderer's provenance; the pool object
      // identifies itself separately.
      expect(b.providerName).toBe("verovio");
      expect(pool.providerName).toBe("verovio-pool");
    } finally {
      await single.dispose?.();
      await pool.dispose();
    }
  }, TIMEOUT);

  it("serves many concurrent renders across the worker pool", async () => {
    const pool = await VerovioRendererPool.create(2);
    try {
      const steps = ["C", "D", "E", "F", "G", "A", "B", "C"];
      const results = await Promise.all(
        steps.map((s) => pool.renderScore({ musicXml: score(s), outputMode: "png" })),
      );
      expect(results).toHaveLength(steps.length);
      for (const r of results) expect(r.pages[0]?.png?.length ?? 0).toBeGreaterThan(0);
      const health = await pool.healthCheck();
      expect(health.ok).toBe(true);
    } finally {
      await pool.dispose();
    }
  }, TIMEOUT);

  it("rejects renders after dispose", async () => {
    const pool = await VerovioRendererPool.create(1);
    await pool.dispose();
    await expect(pool.renderScore({ musicXml: score("C"), outputMode: "svg" })).rejects.toThrow(/disposed/);
  }, TIMEOUT);

  it("rejects an in-flight render on dispose instead of hanging", async () => {
    const pool = await VerovioRendererPool.create(1);
    const inFlight = pool.renderScore({ musicXml: score("C"), outputMode: "png" });
    const disposing = pool.dispose(); // dispose while the job is dispatched to the worker
    await expect(inFlight).rejects.toThrow(/disposed/);
    await disposing;
  }, TIMEOUT);

  it("drains a queue behind a single worker", async () => {
    const pool = await VerovioRendererPool.create(1);
    try {
      const results = await Promise.all(
        ["C", "D", "E", "F", "G"].map((s) => pool.renderScore({ musicXml: score(s), outputMode: "png" })),
      );
      expect(results).toHaveLength(5);
      for (const r of results) expect(r.pages[0]?.png?.length ?? 0).toBeGreaterThan(0);
    } finally {
      await pool.dispose();
    }
  }, TIMEOUT);
});
