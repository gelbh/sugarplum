import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("study face mount", () => {
  it("StudyPage mounts CardFace only (no McqFace import)", () => {
    const src = readFileSync(join(root, "src/routes/StudyPage.tsx"), "utf8");
    expect(src).toMatch(/from ["']\.\.\/study\/CardFace["']/);
    expect(src).not.toMatch(/McqFace/);
  });

  it("CardFace accepts MCQ props and has no content-height-only plate", () => {
    const src = readFileSync(join(root, "src/study/CardFace.tsx"), "utf8");
    expect(src).toMatch(/\bcardId\b/);
    expect(src).toMatch(/\boptions\b/);
    expect(src).toMatch(/type === ["']mcq["']/);
    expect(src).not.toMatch(/maxHeight:\s*["']70vh["']/);
  });

  it("public McqFace.tsx is gone", () => {
    let missing = false;
    try {
      readFileSync(join(root, "src/components/McqFace.tsx"), "utf8");
    } catch {
      missing = true;
    }
    expect(missing).toBe(true);
  });
});
