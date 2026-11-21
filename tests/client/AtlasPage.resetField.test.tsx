/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AtlasPage from "../../src/routes/AtlasPage";
import { ApiError } from "../../src/api/client";
import {
  listAtlasEntries,
  resetEntryFields,
} from "../../src/atlas/hub/apiSource";
import type { AtlasEntryView } from "../../src/atlas/types";
import {
  SessionProvider,
  type SessionValue,
} from "../../src/session/SessionContext";
import { emptyParasiteFields } from "../../worker/atlas/templates/parasite";

vi.mock("../../src/guest/session", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/guest/session")>();
  return { ...actual, isGuest: () => false };
});

vi.mock("../../src/atlas/hub/apiSource", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/atlas/hub/apiSource")>();
  return {
    ...actual,
    listAtlasEntries: vi.fn(),
    resetEntryFields: vi.fn(),
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
  vi.mocked(listAtlasEntries).mockReset();
  vi.mocked(resetEntryFields).mockReset();
});

function editedEntry(): AtlasEntryView {
  const fields = emptyParasiteFields();
  fields.group = "nematode";
  fields.definitiveHosts = ["dog"];
  return {
    id: "toxocara-canis",
    originKey: "toxocara-canis",
    canonicalName: "Toxocara canis",
    commonName: null,
    aliases: [],
    learnerAliases: [],
    fields,
    refs: [],
    images: [],
    editedAt: "2026-11-20T00:00:00.000Z",
    personalNote: null,
    tier: "standard",
    reason: "Standard",
    override: null,
    focusMaterialIds: [],
    inPack: null,
    editedFields: ["definitiveHosts"],
    commonNameEdited: false,
  };
}

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

async function renderEntryPage() {
  vi.mocked(listAtlasEntries).mockResolvedValue({
    entries: [editedEntry()],
    focusRefreshPending: false,
  });
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
            route: { kind: "entry", key: "toxocara-canis" },
          }),
        ),
      ),
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return host;
}

const resetButton = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>(
    'button[aria-label="Reset Definitive hosts"]',
  );

describe("AtlasPage glance field reset", () => {
  it("keeps the entry on screen and shows a failed reset inline", async () => {
    vi.mocked(resetEntryFields).mockRejectedValue(
      new ApiError(500, "Reset exploded"),
    );
    const host = await renderEntryPage();
    expect(resetButton(host)).toBeTruthy();
    await act(async () => {
      resetButton(host)!.click();
    });
    expect(resetEntryFields).toHaveBeenCalledWith("atlas-1", "toxocara-canis", [
      "definitiveHosts",
    ]);
    expect(host.textContent).toContain("Reset exploded");
    expect(host.textContent).toContain("Toxocara canis");
    expect(host.textContent).toContain("Edited: Definitive hosts");
    expect(resetButton(host)!.disabled).toBe(false);
  });

  it("keeps the reset error distinct from a refresh failure", async () => {
    vi.mocked(resetEntryFields).mockResolvedValue(editedEntry());
    const host = await renderEntryPage();
    vi.mocked(listAtlasEntries).mockRejectedValue(new ApiError(500, "down"));
    await act(async () => {
      resetButton(host)!.click();
    });
    expect(host.textContent).toContain("Field reset, but the Atlas could not");
    expect(host.textContent).toContain("Toxocara canis");
  });

  it("disables that Reset while its request runs", async () => {
    let resolve!: (v: AtlasEntryView) => void;
    vi.mocked(resetEntryFields).mockReturnValue(
      new Promise<AtlasEntryView>((r) => {
        resolve = r;
      }),
    );
    const host = await renderEntryPage();
    await act(async () => {
      resetButton(host)!.click();
    });
    expect(resetButton(host)!.disabled).toBe(true);
    const after = { ...editedEntry(), editedFields: [], editedAt: null };
    vi.mocked(listAtlasEntries).mockResolvedValue({
      entries: [after],
      focusRefreshPending: false,
    });
    await act(async () => {
      resolve(after);
    });
    expect(resetButton(host)).toBeNull();
  });
});
