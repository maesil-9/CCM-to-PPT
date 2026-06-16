import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { rasterizeSvg } from "@worship-score/adapters";
import { loadBuildOptions } from "../src/optionsFile.js";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-opt-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function writeOptions(value: unknown): Promise<void> {
  await fs.writeFile(path.join(dir, "options.json"), JSON.stringify(value), "utf8");
}

describe("loadBuildOptions", () => {
  it("returns empty options when options.json is absent", async () => {
    expect((await loadBuildOptions(dir)).options).toEqual({});
  });

  it("rejects a background.image that escapes the score folder", async () => {
    await writeOptions({ background: { image: "../../secret.png" } });
    await expect(loadBuildOptions(dir)).rejects.toThrow(/밖을 가리킬 수 없습니다/);
  });

  it("rejects an invalid hex colour", async () => {
    await writeOptions({ style: { title: { color: "red" } } });
    await expect(loadBuildOptions(dir)).rejects.toThrow(/형식 오류/);
  });

  it("rejects an out-of-range transpose", async () => {
    await writeOptions({ key: { transposeSemitones: 99 } });
    await expect(loadBuildOptions(dir)).rejects.toThrow(/형식 오류/);
  });

  it("rejects unknown keys (strict schema)", async () => {
    await writeOptions({ chords: { visible: true }, bogus: 1 });
    await expect(loadBuildOptions(dir)).rejects.toThrow(/형식 오류/);
  });

  it("rejects a non-image background by magic bytes", async () => {
    await fs.writeFile(path.join(dir, "bg.png"), "not a png");
    await writeOptions({ background: { image: "bg.png" } });
    await expect(loadBuildOptions(dir)).rejects.toThrow(/PNG\/JPEG/);
  });

  it("loads valid options with a real PNG background", async () => {
    const png = rasterizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#000"/></svg>',
    );
    await fs.writeFile(path.join(dir, "bg.png"), png.data);
    await writeOptions({
      chords: { visible: true },
      key: { transposeSemitones: 2 },
      background: { image: "bg.png" },
      style: { card: { color: "FFFFFF", opacity: 0.8 } },
    });

    const { options, backgroundPath } = await loadBuildOptions(dir);
    expect(options.chords?.visible).toBe(true);
    expect(options.key?.transposeSemitones).toBe(2);
    expect(options.background?.mime).toBe("image/png");
    expect(options.style?.card?.opacity).toBe(0.8);
    expect(backgroundPath).toBeTruthy();
  });
});
