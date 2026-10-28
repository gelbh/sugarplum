import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../worker/materials/content-hash";

describe("sha256Hex", () => {
  it("matches NIST SHA-256 empty-string vector", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is stable and distinguishes different inputs", async () => {
    const a = await sha256Hex("my notes");
    expect(a).toHaveLength(64);
    expect(await sha256Hex("my notes")).toBe(a);
    expect(await sha256Hex("other")).not.toBe(a);
  });
});
