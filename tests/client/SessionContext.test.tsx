/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SessionProvider,
  useAuthenticatedSession,
  useSession,
  type SessionValue,
} from "../../src/session/SessionContext";

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

function stubValue(partial: Partial<SessionValue> = {}): SessionValue {
  return {
    user: null,
    refreshSession: async () => {},
    login: async () => {
      throw new Error("login stub");
    },
    register: async () => {
      throw new Error("register stub");
    },
    logout: async () => {},
    ...partial,
  };
}

function Probe() {
  const { user } = useSession();
  return createElement("span", { "data-testid": "id" }, user?.id ?? "none");
}

function AuthProbe() {
  const user = useAuthenticatedSession();
  return createElement("span", { "data-testid": "auth" }, user.id);
}

function Outside() {
  useSession();
  return null;
}

describe("SessionContext", () => {
  it("throws outside provider", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    expect(() => {
      act(() => {
        root.render(createElement(Outside));
      });
    }).toThrow(/useSession requires SessionProvider/);
  });

  it("exposes user from provider", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
      root.render(
        createElement(
          SessionProvider,
          {
            value: stubValue({
              user: { id: "u1", email: "a@b.c" },
            }),
          },
          createElement(Probe),
        ),
      );
    });
    expect(host.querySelector("[data-testid=id]")?.textContent).toBe("u1");
  });

  it("useAuthenticatedSession throws when user is null", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    expect(() => {
      act(() => {
        root.render(
          createElement(
            SessionProvider,
            { value: stubValue({ user: null }) },
            createElement(AuthProbe),
          ),
        );
      });
    }).toThrow(/useAuthenticatedSession requires authenticated user/);
  });

  it("useAuthenticatedSession returns user when present", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
      root.render(
        createElement(
          SessionProvider,
          {
            value: stubValue({
              user: { id: "u1", email: "a@b.c" },
            }),
          },
          createElement(AuthProbe),
        ),
      );
    });
    expect(host.querySelector("[data-testid=auth]")?.textContent).toBe("u1");
  });

  it("exposes login logout register refreshSession on value", async () => {
    const login = vi.fn(async () => ({ id: "u1", email: "a@b.c" }));
    const register = vi.fn(async () => ({ id: "u2", email: "c@d.e" }));
    const logout = vi.fn(async () => {});
    const refreshSession = vi.fn(async () => {});
    function MethodsProbe() {
      const s = useSession();
      return createElement("button", {
        type: "button",
        "data-testid": "go",
        onClick: () => {
          void s.login("a", "b", "t");
          void s.register("c", "d", "t");
          void s.logout();
          void s.refreshSession();
        },
      });
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
      root.render(
        createElement(
          SessionProvider,
          { value: stubValue({ login, logout, register, refreshSession }) },
          createElement(MethodsProbe),
        ),
      );
    });
    await act(async () => {
      host.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(login).toHaveBeenCalled();
    expect(register).toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
    expect(refreshSession).toHaveBeenCalled();
  });
});
