/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import ShellNavRail from "../../src/app/shell/ShellNavRail";

async function renderRail() {
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
});
