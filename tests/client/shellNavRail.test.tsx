/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import ShellNavRail from "../../src/components/shell/ShellNavRail";

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
          streakChip: null,
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

  it("lists destination labels and marks active", async () => {
    const { host } = await renderRail();
    expect(host.textContent).toMatch(/Today/);
    expect(host.textContent).toMatch(/Atlas/);
    const atlas = [...host.querySelectorAll("button")].find((b) =>
      /Atlas/i.test(b.textContent ?? ""),
    );
    expect(atlas?.getAttribute("aria-current")).toBe("page");
  });
});
