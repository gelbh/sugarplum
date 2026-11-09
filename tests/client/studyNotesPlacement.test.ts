/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardFaceMcqBody } from "../../src/components/cardFaceMcq";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("study notes placement (source)", () => {
  it("StudyPage S shortcut does not require revealed", () => {
    const src = readFileSync(join(rootDir, "src/routes/StudyPage.tsx"), "utf8");
    expect(src).toMatch(/notes\.notesAvailable/);
    expect(src).not.toMatch(
      /\(key === ["']s["'] \|\| key === ["']S["']\) && revealed && notes\.notesAvailable/,
    );
  });

  it("CardFace does not keep Notes in the answer footer above Show question", () => {
    const src = readFileSync(join(rootDir, "src/components/CardFace.tsx"), "utf8");
    // Footer block pattern: Notes immediately before Show question in answer footer.
    expect(src).not.toMatch(/Notes[\s\S]{0,200}Show question/);
  });

  it("CardFace MCQ branch forwards notes props into CardFaceMcqBody", () => {
    const src = readFileSync(join(rootDir, "src/components/CardFace.tsx"), "utf8");
    const mcqBlock = src.slice(src.indexOf('type === "mcq"'));
    expect(mcqBlock).toMatch(/notesAvailable=\{notesAvailable\}/);
    expect(mcqBlock).toMatch(/onOpenNotes=\{onOpenNotes\}/);
  });
});

describe("CardFaceMcqBody notes control", () => {
  let root: Root;
  let host: HTMLDivElement;
  let onOpenNotes: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onOpenNotes = vi.fn();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("shows Notes and opens when notesAvailable", () => {
    act(() => {
      root.render(
        createElement(CardFaceMcqBody, {
          cardId: "c1",
          front: "Q?",
          back: "A",
          options: ["A", "B", "C"],
          onGrade: () => true,
          notesAvailable: true,
          onOpenNotes,
        }),
      );
    });
    const btn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Notes"),
    );
    expect(btn).toBeTruthy();
    act(() => btn!.click());
    expect(onOpenNotes).toHaveBeenCalledTimes(1);
  });

  it("hides Notes when notesAvailable is false", () => {
    act(() => {
      root.render(
        createElement(CardFaceMcqBody, {
          cardId: "c1",
          front: "Q?",
          back: "A",
          options: ["A", "B", "C"],
          onGrade: () => true,
          notesAvailable: false,
          onOpenNotes,
        }),
      );
    });
    const btn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Notes"),
    );
    expect(btn).toBeFalsy();
  });
});
