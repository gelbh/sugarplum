import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "src/study");

const expected = [
  "queue/dueCache.ts",
  "queue/policyQueue.ts",
  "queue/subjectKnowledge.ts",
  "queue/subjectRecall.ts",
  "grading/pendingGrades.ts",
  "grading/GradeButtons.tsx",
  "session/StudyChromeContext.tsx",
  "faces/CardFace.tsx",
  "faces/clozeFormat.ts",
  "gestures/cardGestures.ts",
  "media/studyMediaCache.ts",
  "media/warmDueMedia.ts",
  "fsrs/retrievability.ts",
  "cardDraftView.ts",
  "localDay.ts",
  "regenSource.ts",
  "scopeLibraryBack.ts",
  "index.ts",
  "kernel.ts",
];

const mustNotExistAtRoot = [
  "dueCache.ts",
  "pendingGrades.ts",
  "CardFace.tsx",
  "cardGestures.ts",
  "studyMediaCache.ts",
  "retrievability.ts",
  "StudyChromeContext.tsx",
  "subjectKnowledge.ts",
  "subjectRecall.ts",
];

describe("src/study subdomain layout", () => {
  it("keeps leaves under locked subdomain folders", () => {
    for (const rel of expected) {
      expect(existsSync(resolve(root, rel)), rel).toBe(true);
    }
    for (const rel of mustNotExistAtRoot) {
      expect(existsSync(resolve(root, rel)), rel).toBe(false);
    }
  });
});
