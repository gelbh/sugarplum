/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import PublicNightShell from "../../src/components/PublicNightShell";
import { HOME_BRAND } from "../../src/home/homeCopy";
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

async function renderShell(props: { brandMode?: "link" | "heading" } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme },
        createElement(
          PublicNightShell,
          { maxWidth: "xs", ...props },
          createElement("p", null, "body"),
        ),
      ),
    );
  });
  return host;
}

describe("PublicNightShell", () => {
  it("forces night foyer chrome with logo and Alice brand link home", async () => {
    const host = await renderShell();

    const foyer = host.querySelector("[data-dark]");
    expect(foyer).not.toBeNull();

    const logo = host.querySelector('img[src="/logo.png"]');
    expect(logo).not.toBeNull();

    const brand = host.querySelector('a[href="/"]');
    expect(brand).not.toBeNull();
    expect(brand?.textContent).toContain(HOME_BRAND);

    expect(host.textContent).toContain("body");
  });

  it("renders Alice as h1 without a self-link when brandMode is heading", async () => {
    const host = await renderShell({ brandMode: "heading" });

    const heading = host.querySelector("h1");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toContain(HOME_BRAND);

    const brandLink = [...host.querySelectorAll('a[href="/"]')].find((a) =>
      a.textContent?.includes(HOME_BRAND),
    );
    expect(brandLink).toBeUndefined();

    expect(host.textContent).toContain("body");
  });
});
