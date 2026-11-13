import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertPackId,
  assertWithinRoot,
  ingestAnatomyPack,
} from "../../scripts/ingest-anatomy-pack.mjs";

const temps: string[] = [];

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

describe("assertPackId", () => {
  it("accepts lowercase slug", () => {
    expect(assertPackId("canine-heart")).toBe("canine-heart");
  });

  it("refuses path traversal and nested segments", () => {
    expect(() => assertPackId("..")).toThrow(/traversal/i);
    expect(() => assertPackId("../evil")).toThrow(/traversal/i);
    expect(() => assertPackId("foo/bar")).toThrow(/traversal/i);
    expect(() => assertPackId("foo\\bar")).toThrow(/traversal/i);
  });
});

describe("assertWithinRoot", () => {
  it("refuses candidates outside root", () => {
    expect(() =>
      assertWithinRoot("/tmp/pack-root", "/tmp/other/file.glb"),
    ).toThrow(/traversal/i);
  });

  it("allows the root and children", () => {
    expect(assertWithinRoot("/tmp/pack-root", "/tmp/pack-root")).toBe(
      "/tmp/pack-root",
    );
    expect(
      assertWithinRoot("/tmp/pack-root", "/tmp/pack-root/meshes/a.glb"),
    ).toBe("/tmp/pack-root/meshes/a.glb");
  });
});

describe("ingestAnatomyPack traversal smoke", () => {
  it("refuses symlink that escapes --src", () => {
    const src = tempDir("anatomy-pack-src-");
    const outside = tempDir("anatomy-pack-outside-");
    const outRoot = tempDir("anatomy-pack-out-");
    writeFileSync(join(outside, "secret.glb"), "fake");
    symlinkSync(join(outside, "secret.glb"), join(src, "leak.glb"));

    expect(() =>
      ingestAnatomyPack({
        src,
        packId: "smoke-pack",
        outRoot,
      }),
    ).toThrow(/traversal/i);
  });

  it("copies a local drop and writes scene.json", () => {
    const src = tempDir("anatomy-pack-ok-");
    const outRoot = tempDir("anatomy-pack-out-");
    mkdirSync(join(src, "heart"));
    writeFileSync(join(src, "heart", "ventricle.glb"), "fake-glb");
    writeFileSync(join(src, "heart", "ventricle.bin"), "fake-bin");

    const result = ingestAnatomyPack({
      src,
      packId: "smoke-pack",
      title: "Smoke pack",
      outRoot,
    });

    expect(result.meshCount).toBe(1);
    expect(result.extraCount).toBe(1);
    expect(result.regionCount).toBe(1);
    const scene = JSON.parse(
      readFileSync(join(result.outDir, "scene.json"), "utf8"),
    );
    expect(scene.id).toBe("smoke-pack");
    expect(scene.structures).toHaveLength(1);
    expect(scene.structures[0].asset).toBe("./heart/ventricle.glb");
    expect(readFileSync(join(result.outDir, "heart", "ventricle.bin"), "utf8")).toBe(
      "fake-bin",
    );
  });

  it("refuses overlapping src and destination", () => {
    const root = tempDir("anatomy-pack-overlap-");
    mkdirSync(join(root, "smoke-pack", "heart"), { recursive: true });
    writeFileSync(join(root, "smoke-pack", "heart", "a.glb"), "x");

    expect(() =>
      ingestAnatomyPack({
        src: join(root, "smoke-pack"),
        packId: "smoke-pack",
        outRoot: root,
      }),
    ).toThrow(/overlapping/i);
  });

  it("dedupes in-tree mesh symlinks and skips dir cycles", () => {
    const src = tempDir("anatomy-pack-dedupe-");
    const outRoot = tempDir("anatomy-pack-out-");
    mkdirSync(join(src, "heart"));
    writeFileSync(join(src, "heart", "v.glb"), "mesh");
    symlinkSync(join(src, "heart", "v.glb"), join(src, "heart", "v-link.glb"));
    symlinkSync(src, join(src, "loop"));

    const result = ingestAnatomyPack({
      src,
      packId: "smoke-pack",
      outRoot,
    });
    expect(result.meshCount).toBe(1);
  });

  it("rejects colliding structure ids", () => {
    const src = tempDir("anatomy-pack-collide-");
    const outRoot = tempDir("anatomy-pack-out-");
    mkdirSync(join(src, "heart"));
    writeFileSync(join(src, "heart", "a_b.glb"), "1");
    writeFileSync(join(src, "heart", "a-b.glb"), "2");

    expect(() =>
      ingestAnatomyPack({
        src,
        packId: "smoke-pack",
        outRoot,
      }),
    ).toThrow(/Duplicate structure id/i);
  });
});
