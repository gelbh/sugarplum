import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("DraftReviewPage mobile layout contract", () => {
  const src = () =>
    readFileSync(
      resolve(process.cwd(), "src/routes/DraftReviewPage.tsx"),
      "utf8",
    );

  it("gates fillHeight on md-up media query", () => {
    const text = src();
    expect(text).toMatch(/useMediaQuery/);
    expect(text).toMatch(/breakpoints\.up\(\s*["']md["']\s*\)/);
    expect(text).toMatch(/fillHeight=\{fillCard\}/);
  });

  it("releases the ready card column clip below md", () => {
    const text = src();
    expect(text).toMatch(/fillCard\s*\?\s*["']hidden["']\s*:\s*["']visible["']/);
    expect(text).toMatch(/fillCard\s*\?\s*1\s*:\s*["']none["']/);
  });
});
