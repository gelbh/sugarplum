/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnatomyViewerGate from "../../src/anatomy/viewer/AnatomyViewerGate";
import {
  SessionProvider,
  type SessionValue,
} from "../../src/session/SessionContext";

const navigateReplace = vi.fn();

vi.mock("../../src/shared/nav/navigate", () => ({
  navigateReplace: (...args: unknown[]) => navigateReplace(...args),
}));

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
  navigateReplace.mockReset();
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

describe("AnatomyViewerGate", () => {
  it("redirects to /atlas when anatomy_viewer is false", async () => {
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
              user: {
                id: "u1",
                email: "other@example.com",
                anatomy_viewer: false,
              },
            }),
          },
          createElement(AnatomyViewerGate, null, createElement("div", null, "secret")),
        ),
      );
    });
    expect(navigateReplace).toHaveBeenCalledWith("/atlas");
    expect(host.textContent).not.toMatch(/secret/);
  });

  it("renders children when anatomy_viewer is true", async () => {
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
              user: {
                id: "u1",
                email: "gelbharttomer@gmail.com",
                anatomy_viewer: true,
              },
            }),
          },
          createElement(AnatomyViewerGate, null, createElement("div", null, "secret")),
        ),
      );
    });
    expect(navigateReplace).not.toHaveBeenCalled();
    expect(host.textContent).toMatch(/secret/);
  });
});
