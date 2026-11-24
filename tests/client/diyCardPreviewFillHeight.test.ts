import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("DiyCardPreview fillHeight face slot", () => {
  it("uses intrinsic md maxWidth inside the fillHeight branch", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/deckHub/DiyCardPreview.tsx"),
      "utf8",
    );
    const fillBranch = src.match(
      /: fillHeight\s*\n\s*\?\s*\{([\s\S]*?)\}\s*\n\s*: \{/,
    )?.[1];
    expect(fillBranch, "fillHeight ternary arm").toBeTruthy();
    expect(fillBranch).toMatch(
      /maxWidth\s*:\s*\{[\s\S]*?\bmd\s*:\s*editorFaceMaxWidthMd/,
    );
    expect(fillBranch).toMatch(/height\s*:[\s\S]*xs\s*:\s*"100%"/);
  });
});
