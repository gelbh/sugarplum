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
  return {
    ApiError,
    me: vi.fn(),
    api: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(async () => ({ ok: true })),
  };
});

import SessionBootstrap from "../../src/session/SessionBootstrap";
import { useSession } from "../../src/session/SessionContext";
import { theme } from "../../src/theme";

function SessionProbe() {
  const { user } = useSession();
  return createElement(
    "div",
    { "data-testid": "session-user" },
    user?.id ?? "none",
  );
}

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
  vi.useRealTimers();
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

  it("paints legal children during loading before resolve settles", async () => {
    let finish!: (v: { status: "unauthenticated" }) => void;
    const pending = new Promise<{ status: "unauthenticated" }>((r) => {
      finish = r;
    });
    await mount(
      createElement(
        SessionBootstrap,
        {
          pathname: "/privacy",
          resolve: () => pending,
        },
        createElement("div", { "data-testid": "legal" }, "PRIVACY"),
      ),
    );
    expect(host!.querySelector("[data-testid=legal]")?.textContent).toBe(
      "PRIVACY",
    );
    await act(async () => {
      finish({ status: "unauthenticated" });
      await pending;
    });
    expect(host!.querySelector("[data-testid=legal]")?.textContent).toBe(
      "PRIVACY",
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

  it("provides session user to allowed children", async () => {
    await mount(
      createElement(
        SessionBootstrap,
        {
          pathname: "/today",
          resolve: async () => ({
            status: "authenticated" as const,
            user: { id: "u1", email: "a@b.c" },
          }),
        },
        createElement(SessionProbe),
      ),
    );
    expect(host!.querySelector("[data-testid=session-user]")?.textContent).toBe(
      "u1",
    );
  });

  it("does not unmount children during silent refresh", async () => {
    let calls = 0;
    let finishSecond!: (v: {
      status: "authenticated";
      user: { id: string; email: string };
    }) => void;
    const second = new Promise<{
      status: "authenticated";
      user: { id: string; email: string };
    }>((r) => {
      finishSecond = r;
    });
    const resolve = vi.fn(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({
          status: "authenticated" as const,
          user: { id: "u1", email: "a@b.c" },
        });
      }
      return second;
    });
    function RefreshButton() {
      const s = useSession();
      return createElement("button", {
        type: "button",
        "data-testid": "refresh",
        onClick: () => {
          void s.refreshSession();
        },
      });
    }
    await mount(
      createElement(
        SessionBootstrap,
        { pathname: "/today", resolve },
        createElement(
          "div",
          null,
          createElement(SessionProbe),
          createElement(RefreshButton),
        ),
      ),
    );
    expect(host!.querySelector("[data-testid=session-user]")?.textContent).toBe(
      "u1",
    );
    await act(async () => {
      host!.querySelector("[data-testid=refresh]")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(host!.textContent).not.toMatch(/Loading/i);
    expect(host!.querySelector("[data-testid=session-user]")).not.toBeNull();
    await act(async () => {
      finishSecond({
        status: "authenticated",
        user: { id: "u2", email: "b@c.d" },
      });
      await second;
    });
    expect(host!.querySelector("[data-testid=session-user]")?.textContent).toBe(
      "u2",
    );
  });

  it("refetches when document becomes visible after throttle window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({
        status: "authenticated" as const,
        user: { id: "u1", email: "a@b.c" },
      })
      .mockResolvedValueOnce({
        status: "authenticated" as const,
        user: { id: "u2", email: "b@c.d" },
      });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    await mount(
      createElement(
        SessionBootstrap,
        { pathname: "/today", resolve },
        createElement(SessionProbe),
      ),
    );
    expect(resolve).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(60_001);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(host!.querySelector("[data-testid=session-user]")?.textContent).toBe(
      "u2",
    );
  });

  it("skips visibility refetch inside 60s throttle", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const resolve = vi.fn().mockResolvedValue({
      status: "authenticated" as const,
      user: { id: "u1", email: "a@b.c" },
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    await mount(
      createElement(
        SessionBootstrap,
        { pathname: "/today", resolve },
        createElement(SessionProbe),
      ),
    );
    expect(resolve).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
