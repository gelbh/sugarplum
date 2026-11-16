import { describe, expect, it } from "vitest";
import {
  parseUploadArgs,
  uploadAnatomyObject,
} from "../../scripts/uploadAnatomyR2.mjs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("parseUploadArgs", () => {
  it("reads --file and --key", () => {
    expect(
      parseUploadArgs(["--file", "a.glb", "--key", "pack/a.glb"]),
    ).toEqual({ file: "a.glb", key: "pack/a.glb" });
  });

  it("throws when flags missing", () => {
    expect(() => parseUploadArgs(["--file", "a.glb"])).toThrow(/usage/);
  });
});

describe("uploadAnatomyObject", () => {
  it("invokes wrangler with expected flags", () => {
    const dir = mkdtempSync(join(tmpdir(), "r2-up-"));
    const file = join(dir, "x.glb");
    writeFileSync(file, Buffer.alloc(8));
    /** @type {string[] | null} */
    let seen = null;
    uploadAnatomyObject({
      file,
      key: "pack/x.glb",
      run: (_cmd, args) => {
        seen = args;
        return { status: 0, stderr: "" };
      },
    });
    rmSync(dir, { recursive: true, force: true });
    expect(seen).toEqual([
      "wrangler",
      "r2",
      "object",
      "put",
      "sugarplum-anatomy/pack/x.glb",
      "--file",
      file,
      "--remote",
      "--content-type",
      "model/gltf-binary",
      "--cache-control",
      "public, max-age=86400",
    ]);
  });
});
