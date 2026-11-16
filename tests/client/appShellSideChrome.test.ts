import { describe, expect, it } from "vitest";
import {
  DRAWER_WIDTH,
  RAIL_WIDTH,
} from "../../src/components/shell/chromeTokens";
import { resolveShellSideChrome } from "../../src/components/shell/shellSideChrome";

describe("resolveShellSideChrome", () => {
  it("hides side chrome when zen", () => {
    expect(resolveShellSideChrome(false, true, true)).toEqual({
      side: "none",
      sideWidth: 0,
    });
  });

  it("uses no side chrome on phone (dock owns nav)", () => {
    expect(resolveShellSideChrome(true, false, false)).toEqual({
      side: "none",
      sideWidth: 0,
    });
  });

  it("uses rail on medium", () => {
    expect(resolveShellSideChrome(false, true, false)).toEqual({
      side: "rail",
      sideWidth: RAIL_WIDTH,
    });
  });

  it("uses drawer on expanded", () => {
    expect(resolveShellSideChrome(false, false, false)).toEqual({
      side: "drawer",
      sideWidth: DRAWER_WIDTH,
    });
  });
});
