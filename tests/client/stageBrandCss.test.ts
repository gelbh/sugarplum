import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("brand.css stage immersion", () => {
  it("pads safe-area and blocks pinch only on .sp-stage--immersed", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/brand.css"),
      "utf8",
    );
    const immersed =
      css.match(/\.sp-stage--immersed\s*\{[^}]*\}/)?.[0] ?? "";
    const base = css.match(/\.sp-stage\s*\{[^}]*\}/)?.[0] ?? "";
    expect(immersed).toMatch(
      /padding-top:\s*env\(\s*safe-area-inset-top\s*,\s*0px\s*\)/,
    );
    expect(immersed).toMatch(/touch-action:\s*pan-x\s+pan-y/);
    expect(base).not.toMatch(/padding-top:\s*env\(\s*safe-area-inset-top/);
    expect(base).not.toMatch(/touch-action:\s*pan-x\s+pan-y/);
  });
});
