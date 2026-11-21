/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import AtlasPage from "../../src/routes/AtlasPage";
import { listAtlasEntries } from "../../src/atlas/hub/apiSource";
import type { AtlasEntryView } from "../../src/atlas/types";
import {
  SessionProvider,
  type SessionValue,
} from "../../src/session/SessionContext";
import { emptyParasiteFields } from "../../worker/atlas/templates/parasite";

vi.mock("../../src/guest/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/guest/session")>();
  return { ...actual, isGuest: () => true };
});

vi.mock("../../src/atlas/hub/apiSource", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/atlas/hub/apiSource")>();
  return { ...actual, listAtlasEntries: vi.fn() };
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
  localStorage.clear();
  vi.useRealTimers();
  vi.mocked(listAtlasEntries).mockReset();
});

function entry(id: string, name: string, inPack: boolean): AtlasEntryView {
  const fields = emptyParasiteFields();
  fields.group = "arthropod";
  return {
    id,
    originKey: id,
    canonicalName: name,
    commonName: null,
    aliases: [],
    fields,
    refs: [],
    images: [],
    editedAt: null,
    personalNote: null,
    tier: "standard",
    reason: "Standard",
    override: null,
    focusMaterialIds: [],
    inPack,
  };
}

const ENTRIES = [
  entry("psoroptes-ovis", "Psoroptes ovis", true),
  entry("toxocara-canis", "Toxocara canis", false),
];

const session: SessionValue = {
  user: { id: "u1", email: "u1@example.com" } as SessionValue["user"],
  refreshSession: async () => {},
  login: async () => {
    throw new Error("login stub");
  },
  register: async () => {
    throw new Error("register stub");
  },
  logout: async () => {},
};

async function renderPage() {
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
          { value: session },
          createElement(AtlasPage, {
            atlasId: "atlas-1",
            route: { kind: "cabinet" },
          }),
        ),
      ),
    );
  });
  return host;
}

describe("AtlasPage pack hiding", () => {
  it("hides a not-in-pack entry once the list response is fully scanned", async () => {
    vi.mocked(listAtlasEntries).mockResolvedValue({
      entries: ENTRIES,
      focusRefreshPending: false,
    });
    const host = await renderPage();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(host.textContent).toContain("Psoroptes ovis");
    expect(host.textContent).not.toContain("Toxocara canis");
    expect(host.textContent).toContain("1 hidden · Show hidden");
  });

  it("shows every entry while the Focus refresh is still pending", async () => {
    vi.useFakeTimers();
    vi.mocked(listAtlasEntries).mockResolvedValue({
      entries: ENTRIES,
      focusRefreshPending: true,
    });
    const host = await renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(13_000);
    });
    expect(listAtlasEntries).toHaveBeenCalledTimes(7);
    expect(host.textContent).toContain("Psoroptes ovis");
    expect(host.textContent).toContain("Toxocara canis");
    expect(host.textContent).not.toContain("hidden");
    expect(host.textContent).not.toContain("Not in your pack");
  });
});
