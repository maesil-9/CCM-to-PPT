/**
 * WorshipScore AI web server — single Node HTTP server (run via tsx).
 *
 * Serves the static styling-editor frontend and a small JSON API that drives the
 * shared build engine: list scores, live preview (options → slide PNGs), and
 * export (options → PPTX). See ADR-011.
 */
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listScores, loadUiOptions, readBackground, readScore, resolveBuildOptions } from "./scores.js";
import { exportPptx, renderPreview } from "./engine.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, "../public");
const PORT = Number(process.env.PORT ?? 4317);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

async function serveStatic(res: http.ServerResponse, file: string): Promise<void> {
  const resolved = path.resolve(PUBLIC_DIR, file);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }
  try {
    const data = await fs.readFile(resolved);
    const type = CONTENT_TYPES[path.extname(resolved)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Content-Length": data.byteLength });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "not found" });
  }
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > 2_000_000) throw new Error("요청 본문이 너무 큽니다");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    const method = req.method ?? "GET";

    if (method === "GET" && (p === "/" || p === "/index.html")) return serveStatic(res, "index.html");
    if (method === "GET" && (p === "/app.js" || p === "/app.css")) return serveStatic(res, p.slice(1));

    if (method === "GET" && p === "/api/scores") {
      return sendJson(res, 200, await listScores());
    }

    if (method === "GET" && /^\/api\/scores\/[^/]+\/background$/.test(p)) {
      const id = decodeURIComponent(p.split("/")[3] ?? "");
      const bytes = await readBackground(id);
      if (!bytes) return sendJson(res, 404, { error: "배경 없음" });
      const buf = Buffer.from(bytes);
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": buf.byteLength, "Cache-Control": "no-store" });
      return res.end(buf);
    }

    if (method === "GET" && /^\/api\/scores\/[^/]+$/.test(p)) {
      const id = decodeURIComponent(p.split("/")[3] ?? "");
      const [score, options] = await Promise.all([readScore(id), loadUiOptions(id)]);
      return sendJson(res, 200, { id, score, options });
    }

    if (method === "POST" && p === "/api/preview") {
      const body = (await readJsonBody(req)) as { scoreId?: string; options?: unknown };
      if (!body.scoreId) return sendJson(res, 400, { error: "scoreId 필요" });
      const score = await readScore(body.scoreId);
      const build = await resolveBuildOptions(body.scoreId, body.options ?? {});
      return sendJson(res, 200, await renderPreview(score, build));
    }

    if (method === "POST" && p === "/api/export") {
      const body = (await readJsonBody(req)) as { scoreId?: string; options?: unknown };
      if (!body.scoreId) return sendJson(res, 400, { error: "scoreId 필요" });
      const score = await readScore(body.scoreId);
      const build = await resolveBuildOptions(body.scoreId, body.options ?? {});
      const buf = Buffer.from(await exportPptx(score, build));
      const filename = encodeURIComponent(body.scoreId) + ".pptx";
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buf.byteLength,
      });
      return res.end(buf);
    }

    sendJson(res, 404, { error: "not found" });
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`WorshipScore 웹 에디터:  http://localhost:${PORT}`);
});
