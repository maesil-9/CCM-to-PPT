/**
 * WorshipScore AI web server — single Node HTTP server (run via tsx). See ADR-011.
 *
 * Binds to localhost by default (single-user tool; no auth). Serves the static
 * styling-editor frontend and a small JSON API: list scores, live preview
 * (options → slide PNGs), export (options → PPTX). Hardened with security
 * headers, structured errors + status codes, request logging, health/readiness
 * probes, and graceful shutdown.
 */
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";

import {
  listScores,
  loadUiOptions,
  readBackground,
  readScore,
  resolveBuildOptions,
  resolveProfile,
  saveUiOptions,
} from "./scores.js";
import { drain, exportPptx, ExportValidationError, getReadiness, renderPreview } from "./engine.js";
import { HttpError, payloadTooLarge } from "./errors.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, "../public");
const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.WS_HOST ?? "127.0.0.1";
const MAX_BODY = 4_000_000;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'",
};

function writeHead(res: http.ServerResponse, status: number, headers: Record<string, string | number>): void {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  writeHead(res, status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

async function serveStatic(res: http.ServerResponse, file: string): Promise<void> {
  const resolved = path.resolve(PUBLIC_DIR, file);
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }
  try {
    const data = await fs.readFile(resolved);
    const type = CONTENT_TYPES[path.extname(resolved)] ?? "application/octet-stream";
    writeHead(res, 200, { "Content-Type": type, "Content-Length": data.byteLength });
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
    if (total > MAX_BODY) throw payloadTooLarge("요청 본문이 너무 큽니다");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "요청 본문이 올바른 JSON이 아닙니다");
  }
}

interface ErrorResponse {
  status: number;
  message: string;
  log?: unknown;
}

function classifyError(err: unknown): ErrorResponse {
  if (err instanceof HttpError) return { status: err.status, message: err.message };
  if (err instanceof ExportValidationError) return { status: 422, message: err.message };
  if (err instanceof ZodError) {
    const detail = err.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return { status: 422, message: `입력 형식이 올바르지 않습니다 — ${detail}` };
  }
  // Domain build errors carry user-facing Korean messages already.
  if (err instanceof Error && /검증 실패|슬라이드|않습니다/.test(err.message)) {
    return { status: 422, message: err.message };
  }
  return { status: 500, message: "서버 내부 오류가 발생했습니다", log: err };
}

let reqCounter = 0;
function nextReqId(): string {
  reqCounter = (reqCounter + 1) % 1_000_000;
  return reqCounter.toString(36);
}

function logLine(fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(fields));
}

async function route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && (p === "/healthz")) return sendJson(res, 200, { ok: true });
  if (method === "GET" && (p === "/readyz")) {
    const ok = await getReadiness();
    return sendJson(res, ok ? 200 : 503, { ok });
  }

  if (method === "GET" && (p === "/" || p === "/index.html")) return serveStatic(res, "index.html");
  if (method === "GET" && (p === "/app.js" || p === "/app.css")) return serveStatic(res, p.slice(1));

  if (method === "GET" && p === "/api/scores") return sendJson(res, 200, await listScores());

  if (method === "GET" && /^\/api\/scores\/[^/]+\/background$/.test(p)) {
    const id = decodeURIComponent(p.split("/")[3] ?? "");
    const bytes = await readBackground(id);
    if (!bytes) return sendJson(res, 404, { error: "배경 없음" });
    const buf = Buffer.from(bytes);
    writeHead(res, 200, { "Content-Type": "image/png", "Content-Length": buf.byteLength, "Cache-Control": "no-store" });
    return void res.end(buf);
  }

  if (method === "GET" && /^\/api\/scores\/[^/]+$/.test(p)) {
    const id = decodeURIComponent(p.split("/")[3] ?? "");
    const [score, options] = await Promise.all([readScore(id), loadUiOptions(id)]);
    return sendJson(res, 200, { id, score, options });
  }

  if (method === "POST" && /^\/api\/scores\/[^/]+\/options$/.test(p)) {
    const id = decodeURIComponent(p.split("/")[3] ?? "");
    const body = (await readJsonBody(req)) as { options?: unknown };
    await saveUiOptions(id, body.options ?? body);
    return sendJson(res, 200, { ok: true });
  }

  if (method === "POST" && p === "/api/preview") {
    const body = (await readJsonBody(req)) as { scoreId?: string; options?: unknown };
    if (!body.scoreId) throw new HttpError(400, "scoreId가 필요합니다");
    const score = await readScore(body.scoreId);
    const build = await resolveBuildOptions(body.scoreId, body.options ?? {});
    const profile = resolveProfile(body.options ?? {});
    return sendJson(res, 200, await renderPreview(score, build, profile));
  }

  if (method === "POST" && p === "/api/export") {
    const body = (await readJsonBody(req)) as { scoreId?: string; options?: unknown };
    if (!body.scoreId) throw new HttpError(400, "scoreId가 필요합니다");
    const score = await readScore(body.scoreId);
    const build = await resolveBuildOptions(body.scoreId, body.options ?? {});
    const profile = resolveProfile(body.options ?? {});
    const buf = Buffer.from(await exportPptx(score, build, profile));
    const filename = encodeURIComponent(body.scoreId) + ".pptx";
    writeHead(res, 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buf.byteLength,
    });
    return void res.end(buf);
  }

  // Known API prefix but no match → 405/404.
  if (p.startsWith("/api/")) throw new HttpError(404, "존재하지 않는 API 경로입니다");
  return serveStatic(res, "index.html");
}

const server = http.createServer((req, res) => {
  const started = process.hrtime.bigint();
  const reqId = nextReqId();
  req.on("error", () => {});
  void route(req, res)
    .catch((err: unknown) => {
      const { status, message, log } = classifyError(err);
      if (log) logLine({ level: "error", reqId, msg: message, err: log instanceof Error ? log.stack : String(log) });
      if (!res.headersSent) sendJson(res, status, { error: message });
      else res.end();
    })
    .finally(() => {
      const durMs = Number(process.hrtime.bigint() - started) / 1e6;
      logLine({ level: "info", reqId, method: req.method, path: (req.url ?? "").split("?")[0], status: res.statusCode, durMs: Math.round(durMs) });
    });
});

server.requestTimeout = 60_000;
server.headersTimeout = 65_000;

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`WorshipScore 웹 에디터:  http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}  (인증 없는 ${HOST === "127.0.0.1" ? "로컬 전용" : "네트워크"} 도구)`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`\n${signal} 수신 — 진행 중 작업을 마치고 종료합니다…`);
  server.close();
  try {
    await Promise.race([drain(), new Promise((r) => setTimeout(r, 15_000))]);
  } catch {
    /* ignore */
  }
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => logLine({ level: "error", msg: "unhandledRejection", err: String(reason) }));
process.on("uncaughtException", (err) => {
  logLine({ level: "error", msg: "uncaughtException", err: err.stack });
});
