/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import LearningSoftWait from "../../src/study/session/LearningSoftWait";
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

async function renderWait(
  props: Partial<React.ComponentProps<typeof LearningSoftWait>> & {
    onToday: () => void;
  },
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme },
        createElement(LearningSoftWait, {
          pendingCount: 23,
          nextDueAt: new Date(Date.now() + 9 * 60_000).toISOString(),
          readyDueCount: null,
          ...props,
        }),
      ),
    );
  });
}

describe("LearningSoftWait", () => {
  it("shows Today only when no ready due", async () => {
    const onToday = vi.fn();
    await renderWait({ onToday, readyDueCount: 0 });
    expect(document.body.textContent).toMatch(/Learning rests/i);
    expect(document.body.textContent).toMatch(/Next follow-up in/i);
    expect(document.body.textContent).toMatch(
      /23 short-term learning cards still waiting in this session/i,
    );
    expect(document.body.textContent).not.toMatch(/other cards are due/i);
    const buttons = [...document.querySelectorAll("button")].map(
      (b) => b.textContent,
    );
    expect(buttons).toEqual(["Today"]);
  });

  it("shows Start study + Back to Today when readyDueCount > 0", async () => {
    const onToday = vi.fn();
    const onStartStudy = vi.fn();
    await renderWait({ onToday, onStartStudy, readyDueCount: 35 });
    expect(document.body.textContent).toMatch(
      /35 other cards are due now on Today/i,
    );
    const buttons = [...document.querySelectorAll("button")].map(
      (b) => b.textContent,
    );
    expect(buttons).toContain("Start study");
    expect(buttons).toContain("Back to Today");
  });
});
