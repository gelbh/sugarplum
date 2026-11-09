import { describe, expect, it } from "vitest";
import { parseFsrsWJson, validateFsrsW } from "../../src/study/fsrsWeights";

describe("validateFsrsW", () => {
  it("accepts exactly 21 finite numbers", () => {
    const w = Array.from({ length: 21 }, (_, i) => i + 0.1);
    expect(validateFsrsW(w)).toEqual(w);
  });

  it("rejects wrong length or non-finite", () => {
    expect(validateFsrsW(Array(20).fill(1))).toBeNull();
    expect(validateFsrsW([...Array(20).fill(1), Number.NaN])).toBeNull();
  });
});

describe("parseFsrsWJson", () => {
  it("returns undefined for null or invalid JSON", () => {
    expect(parseFsrsWJson(null)).toBeUndefined();
    expect(parseFsrsWJson("not-json")).toBeUndefined();
    expect(parseFsrsWJson("[1,2]")).toBeUndefined();
  });

  it("parses a valid vector", () => {
    const w = Array.from({ length: 21 }, () => 0.4);
    expect(parseFsrsWJson(JSON.stringify(w))).toEqual(w);
  });
});
