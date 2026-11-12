/**
 * @vitest-environment jsdom
 */
import { act, createElement, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import StudyPacingSection from "../../src/settings/StudyPacingSection";
import { DEFAULT_STUDY_PREFS } from "../../src/study/policyQueue";
import { theme } from "../../src/theme";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("../../src/settings/FsrsWeightsSettings", () => ({
  default: function MockFsrs() {
    return createElement("div", { "data-testid": "fsrs-weights" }, "FSRS");
  },
}));

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function renderStudy() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const noop = () => {};
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme },
        createElement(StudyPacingSection, {
          guest: false,
          studyPrefs: DEFAULT_STUDY_PREFS,
          introBudgetInput: "20",
          reviewBudgetInput: "200",
          desiredRetentionInput: "0.9",
          enableFuzz: true,
          enableLoadBalance: true,
          easyDays: DEFAULT_STUDY_PREFS.easyDays,
          studyError: null,
          studyNotice: null,
          studyBusy: false,
          heldIntroCount: 12,
          onIntroBudgetInput: noop,
          onReviewBudgetInput: noop,
          onDesiredRetentionInput: noop,
          onEnableFuzz: noop,
          onEnableLoadBalance: noop,
          onEasyDays: noop,
          onStudyPrefsPatch: noop,
          onSubmitStudy: (e: FormEvent) => e.preventDefault(),
        }),
      ),
    );
  });
  return host;
}

describe("StudyPacingSection dual-path", () => {
  it("shows plain Study labels and hides Advanced until opened", async () => {
    const host = await renderStudy();
    expect(host.textContent).toContain("Study");
    expect(host.textContent).toContain("Catch up");
    expect(host.textContent).toContain("does not reduce your total cards");
    expect(host.textContent).not.toContain("Smooth busy days (load balance)");
    expect(host.textContent).not.toContain("Avoid card pile-ups (fuzz)");

    const advancedBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Advanced scheduling"),
    );
    expect(advancedBtn).toBeTruthy();
    await act(async () => {
      advancedBtn!.click();
    });
    expect(host.textContent).toContain("Smooth busy days (load balance)");
    expect(host.textContent).toContain("Avoid card pile-ups (fuzz)");
  });

  it("exposes customize numbers with plain new-card label when opened", async () => {
    const host = await renderStudy();
    const customize = Array.from(host.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Customize numbers"),
    );
    expect(customize).toBeTruthy();
    await act(async () => {
      customize!.click();
    });
    expect(host.textContent).toContain(
      "How many new cards to start each day",
    );
    expect(host.textContent).not.toMatch(/Intro budget/i);
  });
});
