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

  it("uses rail on medium by default", () => {
    expect(resolveShellSideChrome(false, true, false, null)).toEqual({
      side: "rail",
      sideWidth: RAIL_WIDTH,
    });
  });

  it("uses drawer on expanded by default", () => {
    expect(resolveShellSideChrome(false, false, false, null)).toEqual({
      side: "drawer",
      sideWidth: DRAWER_WIDTH,
    });
  });

  it("honors explicit collapse and expand on any desktop width", () => {
    expect(resolveShellSideChrome(false, false, false, true)).toEqual({
      side: "rail",
      sideWidth: RAIL_WIDTH,
    });
    expect(resolveShellSideChrome(false, true, false, false)).toEqual({
      side: "drawer",
      sideWidth: DRAWER_WIDTH,
    });
  });
});
