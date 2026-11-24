/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import CardsWorkshop from "../../src/deckHub/CardsWorkshop";
import type { CardDraftView } from "../../src/api/client";
import { theme } from "../../src/theme";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

function card(
  id: string,
  front: string,
  type: CardDraftView["type"] = "qa",
): CardDraftView {
  return {
    id,
    deck_id: "d1",
    job_id: null,
    type,
    front,
    back: "",
    provenance: null,
    status: "accepted",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

const noop = () => {};

function workshopProps(
  cards: CardDraftView[],
): ComponentProps<typeof CardsWorkshop> {
  return {
    cards,
    showArchived: false,
    onShowArchivedChange: noop,
    selectedIds: new Set<string>(),
    onToggleSelect: noop,
    onSelectAll: noop,
    onClearSelection: noop,
    archiveBusyId: null,
    batchBusy: false,
    onBatchArchive: noop,
    onBatchRestore: noop,
    onBatchMove: noop,
    onEdit: noop,
    onMove: noop,
    onArchive: noop,
    onRestore: noop,
    onCreateCard: noop,
  };
}

async function renderWorkshop(cards: CardDraftView[]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme },
        createElement(CardsWorkshop, workshopProps(cards)),
      ),
    );
  });
}

describe("CardsWorkshop search", () => {
  it("shows search when cards exist and does not autofocus", async () => {
    await renderWorkshop([card("1", "Alpha worm"), card("2", "Beta fluke")]);

    const input = document.querySelector(
      'input[aria-label="Search cards"]',
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(document.activeElement).not.toBe(input);
  });

  it("hides search when there are no cards", async () => {
    await renderWorkshop([]);

    const input = document.querySelector('input[aria-label="Search cards"]');
    expect(input).toBeNull();
  });
});
