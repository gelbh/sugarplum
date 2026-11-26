/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardFaceMcqBody } from "../../../../src/study/faces/cardFaceMcq";
import { StudyNotesButton } from "../../../../src/study/notes/StudyNotesButton";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("study notes placement (source)", () => {
  it("StudyPage S shortcut does not require revealed", () => {
    const src = readFileSync(join(rootDir, "src/routes/StudyPage.tsx"), "utf8");
    expect(src).toMatch(/notes\.notesAvailable/);
    expect(src).not.toMatch(
      /\(key === ["']s["'] \|\| key === ["']S["']\) && revealed && notes\.notesAvailable/,
    );
  });

  it("CardFace does not keep Notes in the answer footer above Show question", () => {
    const src = readFileSync(join(rootDir, "src/study/faces/CardFace.tsx"), "utf8");
    expect(src).not.toMatch(/Notes[\s\S]{0,200}Show question/);
  });

  it("CardFace composes Notes trailing into MCQ and flip plates", () => {
    const src = readFileSync(join(rootDir, "src/study/faces/CardFace.tsx"), "utf8");
    expect(src).toMatch(/StudyNotesButton/);
    expect(src).toMatch(/overlineTrailing=\{notesTrailing\}/);
    const mcqBlock = src.slice(src.indexOf('type === "mcq"'));
    expect(mcqBlock).toMatch(/overlineTrailing=\{notesTrailing\}/);
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

  it("shows Notes trailing and opens when provided", () => {
    act(() => {
      root.render(
        createElement(CardFaceMcqBody, {
          cardId: "c1",
          front: "Q?",
          back: "A",
          options: ["A", "B", "C"],
          onGrade: () => true,
          overlineTrailing: createElement(StudyNotesButton, { onOpenNotes }),
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

  it("hides Notes when overlineTrailing is omitted", () => {
    act(() => {
      root.render(
        createElement(CardFaceMcqBody, {
          cardId: "c1",
          front: "Q?",
          back: "A",
          options: ["A", "B", "C"],
          onGrade: () => true,
        }),
      );
    });
    const btn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Notes"),
    );
    expect(btn).toBeFalsy();
  });
});
