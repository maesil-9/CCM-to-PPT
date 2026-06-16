/**
 * VerovioRendererPool — a {@link RendererProvider} backed by a pool of Node
 * worker threads, each owning its own Verovio WASM toolkit + resvg instance.
 *
 * Verovio renders synchronously and block the event loop, so a single-thread
 * "pool" gives no real parallelism — true concurrency needs worker threads.
 * This pool round-robins render jobs across N workers, so concurrent requests
 * (e.g. a web server serving several users, or a multi-slide build) render in
 * parallel instead of serializing behind one toolkit.
 *
 * Output is identical to {@link VerovioRenderer} (workers run the same code), so
 * the pool is a drop-in `renderer` for `buildPresentation` and stays
 * byte-deterministic.
 */
import { Worker } from "node:worker_threads";
import { cpus } from "node:os";
import type {
  ProviderHealth,
  RenderScoreInput,
  RenderScoreResult,
  RenderSystemInput,
  RenderSystemResult,
  RendererProvider,
} from "@worship-score/core";

const WORKER_URL = new URL("./renderWorker.mjs", import.meta.url);

interface Job {
  id: number;
  input: RenderScoreInput;
  resolve: (r: RenderScoreResult) => void;
  reject: (e: Error) => void;
}

interface WorkerHandle {
  worker: Worker;
  current: Job | null;
}

interface ResultMessage {
  type: "result";
  id: number;
  providerName: string;
  providerVersion: string;
  runId: string;
  outputMode: RenderScoreInput["outputMode"];
  index: number;
  svg: string;
  png: Uint8Array | null;
  widthPx: number;
  heightPx: number;
}

interface ReadyMessage {
  type: "ready";
  providerName: string;
  providerVersion: string;
}

interface ErrorMessage {
  type: "error";
  id: number;
  message: string;
}

type WorkerMessage = ReadyMessage | ResultMessage | ErrorMessage;

/** Default pool size: leave headroom for the main thread and OS. */
export function defaultPoolSize(): number {
  return Math.max(1, Math.min(4, (cpus().length || 2) - 1));
}

export class VerovioRendererPool implements RendererProvider {
  readonly providerName = "verovio-pool";
  providerVersion = "unknown";

  private readonly handles: WorkerHandle[] = [];
  private readonly idle: WorkerHandle[] = [];
  private readonly queue: Job[] = [];
  private nextId = 1;
  private disposed = false;

  private constructor(private readonly size: number) {}

  /** Spawn `size` workers and resolve once every worker's toolkit is ready. */
  static async create(size = defaultPoolSize()): Promise<VerovioRendererPool> {
    const pool = new VerovioRendererPool(size);
    await Promise.all(Array.from({ length: size }, () => pool.spawn()));
    return pool;
  }

  private spawn(): Promise<void> {
    return new Promise((resolveReady, rejectReady) => {
      const worker = new Worker(WORKER_URL);
      const handle: WorkerHandle = { worker, current: null };
      let ready = false;

      worker.on("message", (msg: WorkerMessage) => {
        if (msg.type === "ready") {
          ready = true;
          if (msg.providerVersion) this.providerVersion = msg.providerVersion;
          this.handles.push(handle);
          this.releaseToIdle(handle);
          resolveReady();
          return;
        }
        const job = handle.current;
        if (!job || msg.id !== job.id) return;
        if (msg.type === "result") job.resolve(toResult(msg));
        else job.reject(new Error(msg.message ?? "render worker error"));
        handle.current = null;
        this.releaseToIdle(handle);
      });

      worker.on("error", (err) => {
        handle.current?.reject(err);
        handle.current = null;
        this.removeHandle(handle);
        if (!ready) rejectReady(err);
        else if (!this.disposed) void this.spawn().catch(() => {});
      });

      worker.on("exit", (code) => {
        if (this.disposed || code === 0) return;
        handle.current?.reject(new Error(`render worker exited (code ${code})`));
        handle.current = null;
        this.removeHandle(handle);
        if (!this.disposed) void this.spawn().catch(() => {});
      });
    });
  }

  private removeHandle(handle: WorkerHandle): void {
    const hi = this.handles.indexOf(handle);
    if (hi >= 0) this.handles.splice(hi, 1);
    const ii = this.idle.indexOf(handle);
    if (ii >= 0) this.idle.splice(ii, 1);
  }

  private releaseToIdle(handle: WorkerHandle): void {
    const next = this.queue.shift();
    if (next) this.dispatch(handle, next);
    else this.idle.push(handle);
  }

  private dispatch(handle: WorkerHandle, job: Job): void {
    handle.current = job;
    handle.worker.postMessage({
      type: "render",
      id: job.id,
      musicXml: job.input.musicXml,
      outputMode: job.input.outputMode,
      ...(job.input.options ? { options: job.input.options } : {}),
    });
  }

  renderScore(input: RenderScoreInput): Promise<RenderScoreResult> {
    if (this.disposed) return Promise.reject(new Error("VerovioRendererPool is disposed"));
    return new Promise<RenderScoreResult>((resolve, reject) => {
      const job: Job = { id: this.nextId++, input, resolve, reject };
      const handle = this.idle.pop();
      if (handle) this.dispatch(handle, job);
      else this.queue.push(job);
    });
  }

  renderSystem(input: RenderSystemInput): Promise<RenderSystemResult> {
    return this.renderScore(input);
  }

  async healthCheck(): Promise<ProviderHealth> {
    const ok = this.handles.length > 0 && !this.disposed;
    return {
      ok,
      providerName: this.providerName,
      providerVersion: this.providerVersion,
      ...(ok ? {} : { detail: "no live workers" }),
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const pending = [...this.queue];
    this.queue.length = 0;
    for (const job of pending) job.reject(new Error("VerovioRendererPool disposed"));
    await Promise.all(this.handles.map((h) => h.worker.terminate()));
    this.handles.length = 0;
    this.idle.length = 0;
  }
}

function toResult(msg: ResultMessage): RenderScoreResult {
  return {
    providerName: msg.providerName,
    providerVersion: msg.providerVersion,
    runId: msg.runId,
    outputMode: msg.outputMode,
    pages: [
      {
        index: msg.index,
        widthPx: msg.widthPx,
        heightPx: msg.heightPx,
        ...(msg.svg ? { svg: msg.svg } : {}),
        ...(msg.png ? { png: msg.png } : {}),
      },
    ],
  };
}
