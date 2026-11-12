/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  SessionProvider,
  useSession,
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

function Probe() {
  const { user } = useSession();
  return createElement("span", { "data-testid": "id" }, user?.id ?? "none");
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
          { value: { user: { id: "u1", email: "a@b.c" } } },
          createElement(Probe),
        ),
      );
    });
    expect(host.querySelector("[data-testid=id]")?.textContent).toBe("u1");
  });
});
