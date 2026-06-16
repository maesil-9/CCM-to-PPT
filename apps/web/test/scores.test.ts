import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCleanDigitalSample } from "@worship-score/pipeline";

// scores.ts reads WS_SCORES_DIR at import time, so set it before importing.
let dir: string;
let scores: typeof import("../src/scores.js");

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-scores-"));
  process.env.WS_SCORES_DIR = dir;
  scores = await import("../src/scores.js");
  await fs.mkdir(path.join(dir, "song1"), { recursive: true });
  await fs.writeFile(path.join(dir, "song1", "score.ir.json"), JSON.stringify(buildCleanDigitalSample()), "utf8");
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("web scores", () => {
  it("lists scores that have a score.ir.json", async () => {
    const list = await scores.listScores();
    expect(list.map((s) => s.id)).toContain("song1");
  });

  it("reads a valid score", async () => {
    const s = await scores.readScore("song1");
    expect(s.measures.length).toBeGreaterThan(0);
  });

  it("rejects a path-traversal score id", async () => {
    await expect(scores.readScore("../../etc")).rejects.toThrow(/잘못된 악보 id/);
  });

  it("404s a missing score", async () => {
    await expect(scores.readScore("nope")).rejects.toThrow(/찾을 수 없습니다/);
  });

  it("resolves valid build options and rejects bad ones", async () => {
    const ok = await scores.resolveBuildOptions("song1", { chords: { visible: true }, key: { transposeSemitones: 2 } });
    expect(ok.chords?.visible).toBe(true);
    await expect(scores.resolveBuildOptions("song1", { key: { transposeSemitones: 999 } })).rejects.toThrow();
    await expect(scores.resolveBuildOptions("song1", { bogus: 1 })).rejects.toThrow();
  });

  it("builds a profile override from layout", () => {
    const p = scores.resolveProfile({ layout: { measuresPerSystem: 1 } });
    expect(p?.measuresPerSystem).toBe(1);
    expect(scores.resolveProfile({})).toBeUndefined();
  });

  it("saves and reloads ui options", async () => {
    await scores.saveUiOptions("song1", { chords: { visible: true }, layout: { measuresPerSystem: 3 } });
    const ui = await scores.loadUiOptions("song1");
    expect(ui.chords?.visible).toBe(true);
    expect(ui.layout?.measuresPerSystem).toBe(3);
  });
});
