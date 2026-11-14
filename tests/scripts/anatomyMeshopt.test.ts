import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  compressGlbFile,
  meshoptEnabledFromArgv,
} from "../../scripts/anatomyMeshopt.mjs";

const temps: string[] = [];
afterEach(() => {
  while (temps.length) {
    const d = temps.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("meshoptEnabledFromArgv", () => {
  it("defaults on", () => {
    expect(meshoptEnabledFromArgv(["node", "script.mjs"])).toBe(true);
  });
  it("disables with --no-meshopt", () => {
    expect(
      meshoptEnabledFromArgv(["node", "script.mjs", "--no-meshopt"]),
    ).toBe(false);
  });
});

describe("compressGlbFile", () => {
  it("writes EXT_meshopt_compression", async () => {
    const dir = mkdtempSync(join(tmpdir(), "meshopt-"));
    temps.push(dir);
    const path = join(dir, "tri.glb");
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
    const io = new NodeIO();
    await io.write(path, doc);

    await compressGlbFile(path);

    await MeshoptDecoder.ready;
    const ioRead = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        "meshopt.decoder": MeshoptDecoder,
      });
    const round = await ioRead.read(path);
    const ext = round
      .getRoot()
      .listExtensionsUsed()
      .some((e) => e.extensionName === EXTMeshoptCompression.EXTENSION_NAME);
    expect(ext).toBe(true);
    expect(readFileSync(path).byteLength).toBeGreaterThan(0);
  });
});
