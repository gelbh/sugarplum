/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AddEntryDialog,
  EditEntryDialog,
  EditLifecycleDialog,
  RecentlyDeletedDialog,
} from "../../src/atlas/AtlasMutateDialogs";
import type { AtlasEntryView } from "../../src/atlas/types";
import {
  emptyParasiteFields,
  lifecycleStageSchema,
} from "../../worker/atlas/templates/parasite";

vi.mock("../../src/atlas/apiSource", () => ({
  createEntry: vi.fn(),
  listDeletedEntries: vi.fn(),
  patchEntry: vi.fn(),
  purgeDeletedEntry: vi.fn(),
  resetEntry: vi.fn(),
  restoreEntry: vi.fn(),
  softDeleteEntry: vi.fn(),
}));

import {
  createEntry,
  listDeletedEntries,
  patchEntry,
} from "../../src/atlas/apiSource";

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
  vi.clearAllMocks();
});

function entry(overrides: Partial<AtlasEntryView> = {}): AtlasEntryView {
  return {
    id: "e1",
    originKey: null,
    canonicalName: "Madeupius fictus",
    commonName: "Custom",
    aliases: [],
    fields: { ...emptyParasiteFields(), group: "nematode" },
    refs: [],
    images: [],
    editedAt: null,
    tier: null,
    reason: null,
    focusMaterialIds: [],
    ...overrides,
  };
}

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
}

describe("AtlasMutateDialogs", () => {
  it("requires a group field on add and blocks create without it", async () => {
    await render(
      createElement(AddEntryDialog, {
        open: true,
        subjectId: "sub-1",
        onClose: () => {},
        onDone: () => {},
      }),
    );

    expect(document.body.textContent).toContain("Group");
    const form = document.body.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(document.body.textContent).toMatch(/Canonical name required|Group required/i);
    expect(createEntry).not.toHaveBeenCalled();
  });

  it("PATCHes definitiveHosts from the edit dialog", async () => {
    vi.mocked(patchEntry).mockResolvedValueOnce(entry());
    const onDone = vi.fn();

    await render(
      createElement(EditEntryDialog, {
        open: true,
        subjectId: "sub-1",
        entry: entry({
          originKey: "fasciola-hepatica",
          fields: {
            ...emptyParasiteFields(),
            group: "trematode",
            definitiveHosts: ["sheep"],
          },
        }),
        onClose: () => {},
        onDone,
      }),
    );

    const hostField = [...document.body.querySelectorAll("input")].find(
      (el) => (el as HTMLInputElement).value.includes("sheep"),
    ) as HTMLInputElement;
    expect(hostField).toBeTruthy();

    await act(async () => {
      const proto = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!;
      proto.set!.call(hostField, "sheep, cattle");
      hostField.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = document.body.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(patchEntry).toHaveBeenCalledWith("sub-1", "e1", {
      commonName: "Custom",
      fields: { definitiveHosts: ["sheep", "cattle"] },
    });
    expect(onDone).toHaveBeenCalled();
  });

  it("PATCHes lifecycleStages from the lifecycle dialog", async () => {
    vi.mocked(patchEntry).mockResolvedValueOnce(entry());
    const onDone = vi.fn();
    const start = entry({
      fields: {
        ...emptyParasiteFields(),
        group: "trematode",
        lifecycleStages: [
          lifecycleStageSchema.parse({
            name: "egg",
            hostRole: "environment",
            diagnostic: true,
          }),
        ],
      },
    });

    await render(
      createElement(EditLifecycleDialog, {
        open: true,
        subjectId: "sub-1",
        entry: start,
        onClose: () => {},
        onDone,
      }),
    );

    expect(document.body.textContent).toContain("Edit lifecycle");
    expect(document.body.textContent).toContain("Live preview");

    const form = document.body.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(patchEntry).toHaveBeenCalledWith(
      "sub-1",
      "e1",
      expect.objectContaining({
        fields: expect.objectContaining({
          diagnosticStage: "egg",
          lifecycleStages: [
            expect.objectContaining({
              name: "egg",
              diagnostic: true,
              infective: false,
            }),
          ],
        }),
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("hides permanent delete for dataset origin tombstones", async () => {
    vi.mocked(listDeletedEntries).mockResolvedValueOnce([
      entry({
        id: "tomb-1",
        originKey: "fasciola-hepatica",
        canonicalName: "Fasciola hepatica",
      }),
      entry({
        id: "tomb-2",
        originKey: null,
        canonicalName: "Learner gone",
      }),
    ]);

    await render(
      createElement(RecentlyDeletedDialog, {
        open: true,
        subjectId: "sub-1",
        onClose: () => {},
        onChanged: () => {},
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("Fasciola hepatica");
    expect(text).toContain("Learner gone");
    const purgeButtons = [...document.body.querySelectorAll("button")].filter(
      (b) => b.textContent?.includes("Delete permanently"),
    );
    expect(purgeButtons).toHaveLength(1);
  });
});
