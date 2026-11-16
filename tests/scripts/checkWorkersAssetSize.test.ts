import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findOversizedAssets } from "../../scripts/checkWorkersAssetSize.mjs";

const temps: string[] = [];
afterEach(() => {
  while (temps.length) {
    const d = temps.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("findOversizedAssets", () => {
  it("returns paths larger than maxBytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "asset-size-"));
    temps.push(dir);
    writeFileSync(join(dir, "ok.bin"), Buffer.alloc(100));
    writeFileSync(join(dir, "big.bin"), Buffer.alloc(200));
    expect(findOversizedAssets(dir, 150)).toEqual([join(dir, "big.bin")]);
  });

  it("returns empty when all fit", () => {
    const dir = mkdtempSync(join(tmpdir(), "asset-size-"));
    temps.push(dir);
    writeFileSync(join(dir, "ok.bin"), Buffer.alloc(100));
    expect(findOversizedAssets(dir, 150)).toEqual([]);
  });
});
