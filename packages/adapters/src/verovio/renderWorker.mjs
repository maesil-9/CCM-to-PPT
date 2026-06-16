/**
 * Worker entry for {@link VerovioRendererPool}.
 *
 * A plain `.mjs` so Node loads it natively. The repo runs on tsx with no build
 * step, so we activate tsx programmatically (`register()`) BEFORE importing the
 * TypeScript renderer source. We import ONLY the renderer module — never the
 * adapters index — because the index pulls in PptxGenJS, which triggers a
 * `require(ESM)` cycle inside a worker thread.
 *
 * Protocol (structured-clone messages):
 *   main → worker: { type: "render", id, musicXml, outputMode, options? }
 *   worker → main: { type: "ready", providerName, providerVersion }
 *                  { type: "result", id, ...RenderScoreResult-ish }
 *                  { type: "error", id, message }
 */
import { parentPort } from "node:worker_threads";
import { register } from "tsx/esm/api";

register();

const { VerovioRenderer } = await import("./renderer.ts");
const renderer = await VerovioRenderer.create();

parentPort.postMessage({
  type: "ready",
  providerName: renderer.providerName,
  providerVersion: renderer.providerVersion,
});

parentPort.on("message", async (msg) => {
  if (!msg || msg.type !== "render") return;
  const { id, musicXml, outputMode, options } = msg;
  try {
    const result = await renderer.renderScore({
      musicXml,
      outputMode,
      ...(options ? { options } : {}),
    });
    const page = result.pages[0];
    parentPort.postMessage({
      type: "result",
      id,
      providerName: result.providerName,
      providerVersion: result.providerVersion,
      runId: result.runId,
      outputMode: result.outputMode,
      index: page?.index ?? 0,
      svg: page?.svg ?? "",
      png: page?.png ?? null,
      widthPx: page?.widthPx ?? 0,
      heightPx: page?.heightPx ?? 0,
    });
  } catch (err) {
    parentPort.postMessage({ type: "error", id, message: err?.message ?? String(err) });
  }
});
