/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DraftsWorkshop from "../../src/deckHub/DraftsWorkshop";
import type { CardDraftView, JobListItem } from "../../src/api/client";
import { theme } from "../../src/theme";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const acceptCard = vi.fn();
const listJobDrafts = vi.fn();
const patchCard = vi.fn();
const rejectCard = vi.fn();

vi.mock("../../src/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/api/client")>(
      "../../src/api/client",
    );
  return {
    ...actual,
    acceptCard: (...args: unknown[]) => acceptCard(...args),
    listJobDrafts: (...args: unknown[]) => listJobDrafts(...args),
    patchCard: (...args: unknown[]) => patchCard(...args),
    rejectCard: (...args: unknown[]) => rejectCard(...args),
  };
});

vi.mock("../../src/achievements/UnlockToastProvider", () => ({
  useUnlockToasts: () => ({ enqueueUnlocks: vi.fn() }),
}));

vi.mock("../../src/nav/navigate", () => ({
  navigate: vi.fn(),
}));

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ThemeProvider, { theme }, node));
  });
}

function blankDraft(overrides: Partial<CardDraftView> = {}): CardDraftView {
  return {
    id: "d1",
    deck_id: "deck1",
    job_id: "job1",
    type: "qa",
    front: "Front one",
    back: "Back one",
    provenance: null,
    status: "draft",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const job: JobListItem = {
  id: "job1",
  status: "ready",
  draft_count: 1,
  deck_id: "deck1",
  deck_title: "Anatomy",
  filename: "notes.pdf",
  created_at: "",
};

describe("deck hub drafts workshop", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  it("shows empty state when there are no draft jobs", async () => {
    await render(
      createElement(DraftsWorkshop, {
        guest: false,
        draftJobs: [],
        onAddMoreMaterial: vi.fn(),
      }),
    );
    expect(document.body.textContent).toMatch(/No draft cards for this deck/i);
    expect(listJobDrafts).not.toHaveBeenCalled();
  });

  it("shows guest state without loading drafts", async () => {
    await render(
      createElement(DraftsWorkshop, {
        guest: true,
        draftJobs: [job],
        onAddMoreMaterial: vi.fn(),
      }),
    );
    expect(document.body.textContent).toMatch(/signed-in account/i);
    expect(listJobDrafts).not.toHaveBeenCalled();
  });

  it("loads a queue and removes a draft after accept", async () => {
    const first = blankDraft({ id: "c1", front: "Cranial nerve IX exit?" });
    const second = blankDraft({
      id: "c2",
      front: "Olfactory nerve is…",
      type: "cloze",
    });
    listJobDrafts
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([second]);
    acceptCard.mockResolvedValue({ ...first, status: "accepted" });

    await render(
      createElement(DraftsWorkshop, {
        guest: false,
        draftJobs: [job],
        onAddMoreMaterial: vi.fn(),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(listJobDrafts).toHaveBeenCalledWith("job1");
    expect(document.body.textContent).toMatch(/1 of 2 remaining/);
    expect(document.body.textContent).toMatch(/Cranial nerve IX exit/);
    expect(document.body.textContent).toMatch(/Open full review/);

    const accept = Array.from(document.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Accept",
    );
    expect(accept).toBeTruthy();
    await act(async () => {
      accept!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(acceptCard).toHaveBeenCalledWith("c1");
    expect(document.body.textContent).toMatch(/1 of 1 remaining/);
    expect(document.body.textContent).toMatch(/Olfactory nerve/);
  });
});
