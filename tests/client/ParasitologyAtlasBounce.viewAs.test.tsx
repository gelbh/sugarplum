/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, VIEW_AS_READ_ONLY_CODE } from "../../src/api/client";
import { VIEW_AS_ATLAS_EMPTY } from "../../src/atlas/hub/atlasOpenCopy";
import { atlasHref } from "../../src/atlas/paths";
import ParasitologyAtlasBounce from "../../src/routes/ParasitologyAtlasBounce";
import {
  SessionProvider,
  type SessionValue,
} from "../../src/session/SessionContext";

const findParasiteAtlas = vi.fn();
const ensureAtlas = vi.fn();
const navigateReplace = vi.fn();
const navigate = vi.fn();

vi.mock("../../src/guest/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/guest/session")>();
  return {
    ...actual,
    isGuest: () => false,
  };
});

vi.mock("../../src/atlas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/atlas")>();
  return {
    ...actual,
    findParasiteAtlas: (...args: unknown[]) => findParasiteAtlas(...args),
    ensureAtlas: (...args: unknown[]) => ensureAtlas(...args),
  };
});

vi.mock("../../src/shared/nav/navigate", () => ({
  navigateReplace: (...args: unknown[]) => navigateReplace(...args),
  navigate: (...args: unknown[]) => navigate(...args),
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
});

beforeEach(() => {
  findParasiteAtlas.mockReset();
  ensureAtlas.mockReset();
  navigateReplace.mockReset();
  navigate.mockReset();
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

const viewingAsUser = {
  id: "source-1",
  email: "source@example.com",
  impersonation: {
    sourceUserId: "source-1",
    sourceEmail: "source@example.com",
    startedAt: Date.now(),
  },
};

async function renderBounce(onBack?: () => void) {
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
          { value: stubValue({ user: viewingAsUser }) },
          createElement(ParasitologyAtlasBounce, { onBack }),
        ),
      ),
    );
  });
  // Flush the async open effect.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return host;
}

describe("ParasitologyAtlasBounce view-as", () => {
  it("shows empty atlas copy when view-as user has no atlas", async () => {
    findParasiteAtlas.mockResolvedValue(null);
    const onBack = vi.fn();
    const host = await renderBounce(onBack);
    expect(host.textContent).toContain(VIEW_AS_ATLAS_EMPTY);
    expect(navigateReplace).not.toHaveBeenCalled();
    const back = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Back to Atlas"),
    );
    expect(back).toBeTruthy();
    await act(async () => {
      back!.click();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("navigateReplace to atlas when view-as user already has one", async () => {
    findParasiteAtlas.mockResolvedValue({
      id: "atlas-1",
      userId: "source-1",
      templateKey: "parasite",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const host = await renderBounce();
    expect(navigateReplace).toHaveBeenCalledWith(atlasHref("atlas-1"));
    expect(host.textContent).not.toContain(VIEW_AS_ATLAS_EMPTY);
  });

  it("maps VIEW_AS_READ_ONLY ApiError to empty atlas copy", async () => {
    findParasiteAtlas.mockRejectedValue(
      new ApiError(
        403,
        "Read-only while viewing as user",
        VIEW_AS_READ_ONLY_CODE,
      ),
    );
    const host = await renderBounce();
    expect(host.textContent).toContain(VIEW_AS_ATLAS_EMPTY);
    expect(host.textContent).not.toContain("Read-only while viewing as user");
    expect(navigateReplace).not.toHaveBeenCalled();
  });
});
