/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShellNavRail from "../../src/components/shell/ShellNavRail";

async function renderRail(onExpand?: () => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(ShellNavRail, {
          drawerNav: [
            {
              id: "today",
              label: "Today",
              href: "/today",
              icon: createElement("span", null, "T"),
            },
            {
              id: "atlas",
              label: "Atlas",
              href: "/atlas",
              icon: createElement("span", null, "A"),
            },
          ],
          active: "atlas",
          genStatus: null,
          streakChip: null,
          onExpand,
        }),
      ),
    );
  });
  return { host, root };
}

describe("ShellNavRail", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("exposes destinations via aria-label only (icons, no visible text labels)", async () => {
    const { host } = await renderRail();
    const atlas = [...host.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Atlas",
    );
    expect(atlas).toBeTruthy();
    expect(atlas?.getAttribute("aria-current")).toBe("page");
    expect(atlas?.textContent?.trim()).toBe("A");
  });

  it("expands via the control", async () => {
    const onExpand = vi.fn();
    const { host } = await renderRail(onExpand);
    const expand = [...host.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Expand sidebar",
    );
    expect(expand).toBeTruthy();
    await act(async () => {
      expand!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(onExpand).toHaveBeenCalled();
  });
});
