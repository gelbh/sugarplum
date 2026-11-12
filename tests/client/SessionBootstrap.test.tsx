/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError, me: vi.fn() };
});

import SessionBootstrap from "../../src/session/SessionBootstrap";
import { theme } from "../../src/theme";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const roots: Root[] = [];
let host: HTMLDivElement | null = null;

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  host?.remove();
  host = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ThemeProvider, { theme }, node));
  });
}

describe("SessionBootstrap", () => {
  it("shows loading and hides children until resolve settles", async () => {
    let finish!: (v: { status: "unauthenticated" }) => void;
    const pending = new Promise<{ status: "unauthenticated" }>((r) => {
      finish = r;
    });
    await mount(
      createElement(
        SessionBootstrap,
        {
          pathname: "/",
          resolve: () => pending,
        },
        createElement("div", { "data-testid": "child" }, "HOME"),
      ),
    );
    expect(host!.textContent).toMatch(/Loading/i);
    expect(host!.querySelector("[data-testid=child]")).toBeNull();
    await act(async () => {
      finish({ status: "unauthenticated" });
      await pending;
    });
    expect(host!.querySelector("[data-testid=child]")?.textContent).toBe(
      "HOME",
    );
  });

  it("redirects authenticated users away from / and keeps children unmounted", async () => {
    const assign = vi.fn();
    await mount(
      createElement(
        SessionBootstrap,
        {
          pathname: "/",
          assign,
          resolve: async () => ({
            status: "authenticated" as const,
            user: { id: "u1", email: "a@b.c" },
          }),
        },
        createElement("div", { "data-testid": "child" }, "HOME"),
      ),
    );
    expect(assign).toHaveBeenCalledWith("/today");
    expect(host!.querySelector("[data-testid=child]")).toBeNull();
  });

  it("redirects unauthenticated users from /today to /login", async () => {
    const assign = vi.fn();
    await mount(
      createElement(
        SessionBootstrap,
        {
          pathname: "/today",
          assign,
          resolve: async () => ({ status: "unauthenticated" as const }),
        },
        createElement("div", { "data-testid": "child" }, "TODAY"),
      ),
    );
    expect(assign).toHaveBeenCalledWith("/login");
    expect(host!.querySelector("[data-testid=child]")).toBeNull();
  });
});
