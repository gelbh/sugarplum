/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import HomePage from "../../src/routes/HomePage";
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

async function renderHome() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(ThemeProvider, { theme }, createElement(HomePage)),
    );
  });
  return host;
}

describe("HomePage foyer", () => {
  it("shows logo mark, brand wordmark, CTAs, and legal links", async () => {
    const host = await renderHome();

    const foyer = host.querySelector("[data-dark]");
    expect(foyer).not.toBeNull();

    const logo = host.querySelector('img[src="/logo.png"]');
    expect(logo).not.toBeNull();

    expect(host.querySelector("[data-foyer-card-preview]")).not.toBeNull();
    expect(host.textContent).toMatch(/spaced repetition/i);

    expect(host.textContent).toContain(HOME_BRAND);

    const signIn = host.querySelector('a[href="/login"]');
    const register = host.querySelector('a[href="/register"]');
    expect(signIn).not.toBeNull();
    expect(register).not.toBeNull();
    expect(signIn?.textContent).toMatch(/sign in/i);
    expect(register?.textContent).toMatch(/create account/i);
    expect(host.textContent).toMatch(/continue as guest/i);

    expect(host.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(host.querySelector('a[href="/terms"]')).not.toBeNull();
    expect(host.querySelector('a[href="/data-deletion"]')).not.toBeNull();
  });
});
