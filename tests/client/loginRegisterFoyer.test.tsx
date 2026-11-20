/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOME_BRAND } from "../../src/home/homeCopy";
import {
  SessionProvider,
  type SessionValue,
} from "../../src/session/SessionContext";
import { theme } from "../../src/theme";

vi.mock("../../src/session/TurnstileWidget", () => ({
  default: function MockTurnstile() {
    return createElement("div", { "data-testid": "turnstile" });
  },
}));

vi.mock("../../src/guest/enterGuest", () => ({
  continueAsGuest: vi.fn(),
}));

import LegalPage from "../../src/legal/LegalPage";
import LoginPage from "../../src/routes/LoginPage";
import RegisterPage from "../../src/routes/RegisterPage";

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

function stubSession(): SessionValue {
  return {
    user: null,
    refreshSession: async () => {},
    login: async () => {},
    register: async () => {},
    logout: async () => {},
  };
}

async function renderWithSession(page: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme },
        createElement(SessionProvider, { value: stubSession() }, page),
      ),
    );
  });
  return host;
}

function expectNightBrand(host: HTMLElement) {
  expect(host.querySelector("[data-dark]")).not.toBeNull();
  expect(host.querySelector('img[src="/logo.png"]')).not.toBeNull();
  const brand = host.querySelector('a[href="/"]');
  expect(brand).not.toBeNull();
  expect(brand?.textContent).toContain(HOME_BRAND);
}

describe("auth and legal night foyer", () => {
  it("LoginPage uses night shell and keeps auth controls", async () => {
    const host = await renderWithSession(createElement(LoginPage));
    expectNightBrand(host);
    expect(host.querySelector('button[type="submit"]')?.textContent).toMatch(
      /sign in/i,
    );
    expect(host.querySelector('a[href="/api/auth/google/start"]')).not.toBeNull();
    expect(host.textContent).toMatch(/continue as guest/i);
    expect(host.querySelector('[data-testid="turnstile"]')).not.toBeNull();
  });

  it("RegisterPage uses night shell and keeps register controls", async () => {
    const host = await renderWithSession(createElement(RegisterPage));
    expectNightBrand(host);
    expect(host.querySelector('button[type="submit"]')?.textContent).toMatch(
      /register/i,
    );
    expect(host.querySelector('a[href="/api/auth/google/start"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="turnstile"]')).not.toBeNull();
  });

  it("LegalPage uses night shell without sidebar logo", async () => {
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
            LegalPage,
            { title: "Privacy Policy" },
            createElement("p", null, "legal body"),
          ),
        ),
      );
    });

    expectNightBrand(host);
    expect(host.querySelector('img[src="/logo-sidebar.png"]')).toBeNull();
    expect(host.textContent).toContain("Privacy Policy");
    expect(host.textContent).toContain("legal body");
    expect(host.querySelector('nav[aria-label="Legal"]')).not.toBeNull();
  });
});
