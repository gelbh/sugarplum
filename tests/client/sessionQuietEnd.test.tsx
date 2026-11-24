/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import SessionQuietEnd from "../../src/study/session/SessionQuietEnd";
import { theme } from "../../src/theme";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

describe("SessionQuietEnd", () => {
  it("renders Alice pause copy and fires Today", async () => {
    const onToday = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
      root.render(
        createElement(
          ThemeProvider,
          { theme },
          createElement(SessionQuietEnd, {
            canStudyMore: false,
            studyMoreBusy: false,
            onStudyMore: () => {},
            onToday,
            scopeBack: null,
          }),
        ),
      );
    });
    expect(document.body.textContent).toMatch(/Quiet for now/i);
    expect(document.body.textContent).toMatch(/No cards left in this pass/i);
    const button = document.querySelector("button");
    expect(button?.textContent).toMatch(/Today/i);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("renders next-cards countdown when nextDueAt is set", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
      root.render(
        createElement(
          ThemeProvider,
          { theme },
          createElement(SessionQuietEnd, {
            canStudyMore: false,
            studyMoreBusy: false,
            onStudyMore: () => {},
            onToday: () => {},
            scopeBack: null,
            nextDueAt: new Date(Date.now() + 12 * 60_000).toISOString(),
          }),
        ),
      );
    });
    expect(document.body.textContent).toMatch(/Next cards in/i);
    expect(document.body.textContent).toMatch(/\d+m/);
  });
});
