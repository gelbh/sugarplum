/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import StudyFreshEmpty from "../../src/study/StudyFreshEmpty";
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

describe("StudyFreshEmpty", () => {
  it("renders Alice pause copy and fires the action", async () => {
    const onAction = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
      root.render(
        createElement(
          ThemeProvider,
          { theme },
          createElement(StudyFreshEmpty, {
            title: "Nothing due yet",
            body: "Add material to create your first cards.",
            actionLabel: "Open Library",
            onAction,
          }),
        ),
      );
    });
    expect(document.body.textContent).toMatch(/Nothing due yet/i);
    expect(document.body.textContent).toMatch(
      /Add material to create your first cards/i,
    );
    const button = document.querySelector("button");
    expect(button?.textContent).toMatch(/Open Library/i);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
