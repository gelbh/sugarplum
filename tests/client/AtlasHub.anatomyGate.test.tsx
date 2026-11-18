/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import AtlasHub from "../../src/routes/AtlasHub";
import {
  SessionProvider,
  type SessionValue,
} from "../../src/session/SessionContext";

vi.mock("../../src/guest/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/guest/session")>();
  return {
    ...actual,
    isGuest: () => false,
  };
});

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

async function renderHub(user: SessionValue["user"]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(
          SessionProvider,
          { value: stubValue({ user }) },
          createElement(AtlasHub),
        ),
      ),
    );
  });
  return host;
}

describe("AtlasHub anatomy gate", () => {
  it("hides Anatomy card when anatomy_viewer is false", async () => {
    const host = await renderHub({
      id: "u1",
      email: "other@example.com",
      anatomy_viewer: false,
    });
    expect(host.textContent).toMatch(/Parasitology/);
    expect(host.textContent).not.toMatch(/Interactive 3D osteology/);
  });

  it("shows Anatomy card when anatomy_viewer is true", async () => {
    const host = await renderHub({
      id: "u1",
      email: "gelbharttomer@gmail.com",
      anatomy_viewer: true,
    });
    expect(host.textContent).toMatch(/Interactive 3D osteology/);
    expect(host.textContent).toMatch(/Parasitology/);
  });
});
