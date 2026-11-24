/**
 * @vitest-environment jsdom
 */
import {
  act,
  createElement,
  useEffect,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import CardsWorkshop from "../../src/deckHub/cards/CardsWorkshop";
import type { CardDraftView } from "../../src/api/client";
import { pruneIdsToVisible } from "../../src/deckHub/workshop/workshopSearch";
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
  overrides: Partial<ComponentProps<typeof CardsWorkshop>> = {},
): ComponentProps<typeof CardsWorkshop> {
  return {
    cards,
    showArchived: false,
    onShowArchivedChange: noop,
    selectedIds: new Set<string>(),
    onToggleSelect: noop,
    onSelectAll: noop,
    onClearSelection: noop,
    onPruneSelection: noop,
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
    ...overrides,
  };
}

async function renderTree(tree: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ThemeProvider, { theme }, tree));
  });
  return root;
}

async function renderWorkshop(
  cards: CardDraftView[],
  overrides: Partial<ComponentProps<typeof CardsWorkshop>> = {},
) {
  await renderTree(
    createElement(CardsWorkshop, workshopProps(cards, overrides)),
  );
}

async function setSearchValue(value: string) {
  const input = document.querySelector(
    'input[aria-label="Search cards"]',
  ) as HTMLInputElement | null;
  expect(input).toBeTruthy();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input!, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    input!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function SelectionHarness({
  cards,
  initialSelected,
  onSelectedChange,
}: {
  cards: CardDraftView[];
  initialSelected: string[];
  onSelectedChange: (ids: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(initialSelected),
  );
  useEffect(() => {
    onSelectedChange([...selectedIds].sort());
  }, [selectedIds, onSelectedChange]);
  return createElement(
    CardsWorkshop,
    workshopProps(cards, {
      selectedIds,
      onPruneSelection: (visibleIds) => {
        setSelectedIds((prev) => pruneIdsToVisible(prev, visibleIds));
      },
    }),
  );
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

  it("filters cards by query", async () => {
    await renderWorkshop([card("1", "Alpha worm"), card("2", "Beta fluke")]);

    await setSearchValue("alpha");

    expect(document.body.textContent).toMatch(/Alpha worm/);
    expect(document.body.textContent).not.toMatch(/Beta fluke/);
  });

  it("prunes selection on filter and keeps still-visible ids when refining", async () => {
    const snapshots: string[][] = [];
    await renderTree(
      createElement(SelectionHarness, {
        cards: [
          card("1", "Alpha worm life"),
          card("2", "Alpha fluke"),
          card("3", "Beta fluke"),
        ],
        initialSelected: ["1", "2", "3"],
        onSelectedChange: (ids) => {
          snapshots.push(ids);
        },
      }),
    );

    await setSearchValue("alpha");
    expect(snapshots.at(-1)?.slice().sort()).toEqual(["1", "2"]);
    expect(document.body.textContent).toMatch(/Alpha worm life/);
    expect(document.body.textContent).not.toMatch(/Beta fluke/);

    await setSearchValue("alpha worm");
    expect(snapshots.at(-1)).toEqual(["1"]);
  });

  it("clears the search query when Show archived toggles", async () => {
    let archived = false;
    await renderWorkshop([card("1", "Alpha worm"), card("2", "Beta fluke")], {
      onShowArchivedChange: (checked) => {
        archived = checked;
      },
    });

    await setSearchValue("alpha");
    const input = document.querySelector(
      'input[aria-label="Search cards"]',
    ) as HTMLInputElement;
    expect(input.value).toBe("alpha");

    const archivedLabel = [...document.querySelectorAll("label")].find((el) =>
      el.textContent?.includes("Show archived"),
    );
    const toggle = archivedLabel?.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(toggle).toBeTruthy();

    await act(async () => {
      toggle!.click();
    });

    expect(archived).toBe(true);
    expect(input.value).toBe("");
  });
});
