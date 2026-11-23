/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import MaterialsWorkshop from "../../src/deckHub/MaterialsWorkshop";
import type { MaterialListItem } from "../../src/api/client";
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

function material(
  id: string,
  filename: string,
  kind: MaterialListItem["kind"] = "pdf",
): MaterialListItem {
  return {
    id,
    deck_id: "d1",
    kind,
    r2_key: `k/${id}`,
    filename,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

const noop = () => {};

function workshopProps(
  materials: MaterialListItem[],
): ComponentProps<typeof MaterialsWorkshop> {
  return {
    materials,
    busyId: null,
    guest: false,
    onUpload: noop,
    onDelete: noop,
  };
}

async function renderWorkshop(materials: MaterialListItem[]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme },
        createElement(MaterialsWorkshop, workshopProps(materials)),
      ),
    );
  });
}

describe("MaterialsWorkshop search", () => {
  it("shows search when materials exist and does not autofocus", async () => {
    await renderWorkshop([
      material("1", "Lecture-03.pdf"),
      material("2", "Notes.txt", "text"),
    ]);

    const input = document.querySelector(
      'input[aria-label="Search files"]',
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(document.activeElement).not.toBe(input);
  });

  it("hides search when there are no materials", async () => {
    await renderWorkshop([]);

    const input = document.querySelector('input[aria-label="Search files"]');
    expect(input).toBeNull();
  });
});
