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
import { Document, NodeIO } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  EXTMeshoptCompression,
} from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
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
  it("refuses symlink that escapes --src", async () => {
    const src = tempDir("anatomy-pack-src-");
    const outside = tempDir("anatomy-pack-outside-");
    const outRoot = tempDir("anatomy-pack-out-");
    writeFileSync(join(outside, "secret.glb"), "fake");
    symlinkSync(join(outside, "secret.glb"), join(src, "leak.glb"));

    await expect(
      ingestAnatomyPack({
        src,
        packId: "smoke-pack",
        outRoot,
        meshopt: false,
      }),
    ).rejects.toThrow(/traversal/i);
  });

  it("copies a local drop and writes scene.json", async () => {
    const src = tempDir("anatomy-pack-ok-");
    const outRoot = tempDir("anatomy-pack-out-");
    mkdirSync(join(src, "heart"));
    writeFileSync(join(src, "heart", "ventricle.glb"), "fake-glb");
    writeFileSync(join(src, "heart", "ventricle.bin"), "fake-bin");

    const result = await ingestAnatomyPack({
      src,
      packId: "smoke-pack",
      title: "Smoke pack",
      outRoot,
      meshopt: false,
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

  it("refuses overlapping src and destination", async () => {
    const root = tempDir("anatomy-pack-overlap-");
    mkdirSync(join(root, "smoke-pack", "heart"), { recursive: true });
    writeFileSync(join(root, "smoke-pack", "heart", "a.glb"), "x");

    await expect(
      ingestAnatomyPack({
        src: join(root, "smoke-pack"),
        packId: "smoke-pack",
        outRoot: root,
        meshopt: false,
      }),
    ).rejects.toThrow(/overlapping/i);
  });

  it("dedupes in-tree mesh symlinks and skips dir cycles", async () => {
    const src = tempDir("anatomy-pack-dedupe-");
    const outRoot = tempDir("anatomy-pack-out-");
    mkdirSync(join(src, "heart"));
    writeFileSync(join(src, "heart", "v.glb"), "mesh");
    symlinkSync(join(src, "heart", "v.glb"), join(src, "heart", "v-link.glb"));
    symlinkSync(src, join(src, "loop"));

    const result = await ingestAnatomyPack({
      src,
      packId: "smoke-pack",
      outRoot,
      meshopt: false,
    });
    expect(result.meshCount).toBe(1);
  });

  it("rejects colliding structure ids", async () => {
    const src = tempDir("anatomy-pack-collide-");
    const outRoot = tempDir("anatomy-pack-out-");
    mkdirSync(join(src, "heart"));
    writeFileSync(join(src, "heart", "a_b.glb"), "1");
    writeFileSync(join(src, "heart", "a-b.glb"), "2");

    await expect(
      ingestAnatomyPack({
        src,
        packId: "smoke-pack",
        outRoot,
        meshopt: false,
      }),
    ).rejects.toThrow(/Duplicate structure id/i);
  });

  it("default meshopt writes EXT_meshopt_compression", async () => {
    const src = tempDir("anatomy-pack-meshopt-src-");
    const outRoot = tempDir("anatomy-pack-meshopt-out-");
    mkdirSync(join(src, "heart"));
    const path = join(src, "heart", "tri.glb");
    const doc = new Document();
    const buffer = doc.createBuffer();
    const position = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(buffer);
    const indices = doc
      .createAccessor()
      .setType("SCALAR")
      .setArray(new Uint16Array([0, 1, 2]))
      .setBuffer(buffer);
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", position)
      .setIndices(indices);
    doc.createMesh().addPrimitive(prim);
    doc.createNode().setMesh(doc.getRoot().listMeshes()[0]);
    doc.createScene().addChild(doc.getRoot().listNodes()[0]);
    await new NodeIO().write(path, doc);

    const result = await ingestAnatomyPack({
      src,
      packId: "meshopt-pack",
      outRoot,
    });

    await MeshoptDecoder.ready;
    const round = await new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder })
      .read(join(result.outDir, "heart", "tri.glb"));
    const ext = round
      .getRoot()
      .listExtensionsUsed()
      .some((e) => e.extensionName === EXTMeshoptCompression.EXTENSION_NAME);
    expect(ext).toBe(true);
  });

  it("merges clips.json and prefers drop CREDITS.md", () => {
    const src = tempDir("anatomy-pack-clips-");
    const outRoot = tempDir("anatomy-pack-out-");
    writeFileSync(join(src, "model.glb"), "fake-glb");
    writeFileSync(
      join(src, "clips.json"),
      JSON.stringify([
        { id: "pulse", label: "Pulse", animation: "Pulse", loop: true },
      ]),
    );
    writeFileSync(join(src, "CREDITS.md"), "# Drop credits\nIVALA/SPL/2026-001\n");

    const result = ingestAnatomyPack({
      src,
      packId: "clip-smoke",
      title: "Clip smoke",
      outRoot,
    });

    const scene = JSON.parse(
      readFileSync(join(result.outDir, "scene.json"), "utf8"),
    );
    expect(scene.clips).toEqual([
      { id: "pulse", label: "Pulse", animation: "Pulse", loop: true },
    ]);
    expect(readFileSync(join(result.outDir, "CREDITS.md"), "utf8")).toContain(
      "IVALA/SPL/2026-001",
    );
  });

  it("rejects empty clips.json", () => {
    const src = tempDir("anatomy-pack-clips-empty-");
    const outRoot = tempDir("anatomy-pack-out-");
    writeFileSync(join(src, "model.glb"), "fake-glb");
    writeFileSync(join(src, "clips.json"), "[]");

    expect(() =>
      ingestAnatomyPack({
        src,
        packId: "clip-smoke",
        outRoot,
      }),
    ).toThrow(/clips\.json must be a non-empty array/);
  });
});
