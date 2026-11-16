import { describe, expect, it } from "vitest";
import { resolveShellSideChrome } from "../../src/components/shell/shellSideChrome";

describe("resolveShellSideChrome", () => {
  it("hides chrome when zen", () => {
    expect(resolveShellSideChrome(false, true, true)).toEqual({
      side: "none",
      sideWidth: 0,
      topBand: false,
    });
  });

  it("uses no top band on phone (dock owns nav)", () => {
    expect(resolveShellSideChrome(true, false, false)).toEqual({
      side: "none",
      sideWidth: 0,
      topBand: false,
    });
  });

  it("uses top pictogram band from sm up", () => {
    expect(resolveShellSideChrome(false, true, false)).toEqual({
      side: "top",
      sideWidth: 0,
      topBand: true,
    });
    expect(resolveShellSideChrome(false, false, false)).toEqual({
      side: "top",
      sideWidth: 0,
      topBand: true,
    });
  });
});
