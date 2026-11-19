/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import DialogEyebrow from "../../src/ui/DialogEyebrow";
import { theme } from "../../src/theme";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ThemeProvider, { theme }, node));
  });
}

describe("DialogEyebrow", () => {
  it("renders the label with primary tone by default", async () => {
    await render(createElement(DialogEyebrow, { label: "Approve" }));
    const el = document.querySelector("p");
    expect(el?.textContent).toBe("Approve");
    expect(getComputedStyle(el!).color).toBe(
      "var(--mui-palette-primary-main)",
    );
  });

  it("applies error.main when tone is error", async () => {
    await render(
      createElement(DialogEyebrow, { label: "Regenerate", tone: "error" }),
    );
    const el = document.querySelector("p");
    expect(el?.textContent).toBe("Regenerate");
    expect(getComputedStyle(el!).color).toBe("var(--mui-palette-error-main)");
  });
});
