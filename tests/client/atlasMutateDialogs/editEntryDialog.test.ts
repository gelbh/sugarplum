/**
 * @vitest-environment jsdom
 */
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditEntryDialog } from "../../../src/atlas/mutate/EditEntryDialog";
import {
  DIAGNOSTIC_TEST_NAME_ERROR,
  PPP_ERROR,
} from "../../../src/atlas/mutate/entryPatch";
import type { AtlasEntryView } from "../../../src/atlas/types";
import {
  emptyParasiteFields,
  lifecycleStageSchema,
} from "../../../worker/atlas/templates/parasite";

vi.mock("../../../src/atlas/hub/apiSource", () => ({
  createEntry: vi.fn(),
  listDeletedEntries: vi.fn(),
  patchEntry: vi.fn(),
  purgeDeletedEntry: vi.fn(),
  resetEntry: vi.fn(),
  resetEntryFields: vi.fn(),
  restoreEntry: vi.fn(),
  softDeleteEntry: vi.fn(),
}));

import {
  patchEntry,
  resetEntryFields,
} from "../../../src/atlas/hub/apiSource";

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
    personalNote: null,
    tier: null,
    reason: null,
    override: null,
    focusMaterialIds: [],
    inPack: null,
    editedFields: [],
    commonNameEdited: false,
    learnerAliases: [],
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

function fieldByLabel(label: string): HTMLInputElement | HTMLTextAreaElement {
  const el = [...document.body.querySelectorAll("label")].find(
    (l) => (l.textContent ?? "").replace(/\s*\*$/, "").trim() === label,
  );
  if (!el) throw new Error(`No field labelled ${label}`);
  return document.getElementById(el.htmlFor) as
    | HTMLInputElement
    | HTMLTextAreaElement;
}

async function typeInto(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitForm() {
  const form = document.body.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function buttonNamed(text: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === text,
  );
  if (!button) throw new Error(`No button ${text}`);
  return button;
}

function editDialog(props: Record<string, unknown> = {}) {
  return createElement(EditEntryDialog, {
    open: true,
    atlasId: "atlas-1",
    entry: entry(),
    onClose: () => {},
    onDone: () => {},
    ...props,
  } as Parameters<typeof EditEntryDialog>[0]);
}

describe("EditEntryDialog sections", () => {
  it("renders every section in spec order", async () => {
    await render(editDialog());
    const labels = [...document.body.querySelectorAll("section")].map((s) =>
      s.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "Names",
      "Taxonomy",
      "Hosts",
      "Biology",
      "Distribution",
      "Clinical",
      "Diagnosis",
    ]);
  });

  it("sends a sparse patch with learner aliases", async () => {
    vi.mocked(patchEntry).mockResolvedValueOnce(entry());
    await render(
      editDialog({
        entry: entry({
          originKey: "psoroptes-ovis",
          aliases: ["scab mite", "sheep scab"],
          learnerAliases: ["sheep scab"],
        }),
      }),
    );
    expect(fieldByLabel("Extra aliases").value).toBe("sheep scab");
    await typeInto(fieldByLabel("Extra aliases"), "sheep scab\nscab mite");
    await typeInto(fieldByLabel("Significance"), "Causes sheep scab.");
    await submitForm();
    expect(patchEntry).toHaveBeenCalledWith("atlas-1", "e1", {
      aliases: ["sheep scab", "scab mite"],
      fields: { significance: "Causes sheep scab." },
    });
  });

  it("closes without a request when nothing changed", async () => {
    const onClose = vi.fn();
    await render(editDialog({ onClose }));
    await submitForm();
    expect(patchEntry).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the PPP error inline and does not save", async () => {
    await render(editDialog());
    await typeInto(fieldByLabel("PPP min (days)"), "10");
    await submitForm();
    expect(patchEntry).not.toHaveBeenCalled();
    expect(
      document.getElementById("atlas-edit-biology")?.textContent,
    ).toContain("Enter whole-number min and max days");
  });

  it("offers the scientific name only for learner-added entries", async () => {
    await render(editDialog({ entry: entry({ originKey: null }) }));
    expect(fieldByLabel("Scientific name").value).toBe("Madeupius fictus");
    act(() => {
      roots.splice(0).forEach((r) => r.unmount());
    });
    document.body.replaceChildren();

    await render(editDialog({ entry: entry({ originKey: "fasciola-hepatica" }) }));
    expect(() => fieldByLabel("Scientific name")).toThrow();
    expect(document.body.textContent).toContain("add an alias instead");
  });

  it("scrolls the requested section into view", async () => {
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    try {
      await render(editDialog({ initialSection: "distribution" }));
      expect(scrolled).toContain("atlas-edit-distribution");
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("links the Biology section to the lifecycle editor", async () => {
    const onEditLifecycle = vi.fn();
    await render(editDialog({ onEditLifecycle }));
    await act(async () => {
      buttonNamed("Edit lifecycle stages").click();
    });
    expect(onEditLifecycle).toHaveBeenCalled();
  });

  it("marks overridden fields and resets one without losing other edits", async () => {
    const edited = entry({
      originKey: "psoroptes-ovis",
      editedFields: ["significance"],
      fields: {
        ...emptyParasiteFields(),
        group: "arthropod",
        significance: "Mine",
      } as AtlasEntryView["fields"],
    });
    vi.mocked(resetEntryFields).mockResolvedValueOnce({
      ...edited,
      editedFields: [],
      fields: { ...edited.fields, significance: "Dataset text" },
    });
    const onDone = vi.fn();
    await render(editDialog({ entry: edited, onDone }));
    await typeInto(fieldByLabel("Vector role"), "Unsaved vector");
    const reset = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Reset Significance"]',
    );
    expect(reset).toBeTruthy();
    await act(async () => {
      reset!.click();
    });
    expect(resetEntryFields).toHaveBeenCalledWith("atlas-1", "e1", ["significance"]);
    expect(fieldByLabel("Significance").value).toBe("Dataset text");
    expect(fieldByLabel("Vector role").value).toBe("Unsaved vector");
    expect(
      document.body.querySelector('button[aria-label="Reset Significance"]'),
    ).toBeNull();
    expect(onDone).toHaveBeenCalled();
  });

  it("resets lifecycle stages and then saves without a stale diagnosticStage", async () => {
    const stage = (name: string) =>
      lifecycleStageSchema.parse({ name, diagnostic: true });
    const edited = entry({
      originKey: "psoroptes-ovis",
      editedFields: ["lifecycleStages"],
      fields: {
        ...emptyParasiteFields(),
        group: "arthropod",
        lifecycleStages: [stage("egg")],
        diagnosticStage: "egg",
      } as AtlasEntryView["fields"],
    });
    const fresh = {
      ...edited,
      editedFields: [],
      fields: {
        ...edited.fields,
        lifecycleStages: [stage("adult")],
        diagnosticStage: "adult",
      },
    };
    vi.mocked(resetEntryFields).mockResolvedValueOnce(fresh);
    vi.mocked(patchEntry).mockResolvedValueOnce(fresh);
    await render(editDialog({ entry: edited }));
    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Reset Lifecycle stages"]',
        )!
        .click();
    });
    expect(fieldByLabel("Diagnostic stage").value).toBe("adult");
    await typeInto(fieldByLabel("Vector role"), "Mechanical");
    await submitForm();
    expect(patchEntry).toHaveBeenCalledWith("atlas-1", "e1", {
      fields: { vectorRole: "Mechanical" },
    });
  });

  it("keeps another field's unsaved edit across a reset while the page reloads", async () => {
    const edited = entry({
      originKey: "psoroptes-ovis",
      editedFields: ["significance"],
      fields: {
        ...emptyParasiteFields(),
        group: "arthropod",
        significance: "Mine",
      } as AtlasEntryView["fields"],
    });
    const fresh = {
      ...edited,
      editedFields: [],
      fields: { ...edited.fields, significance: "Dataset text" },
    };
    vi.mocked(resetEntryFields).mockResolvedValueOnce(fresh);
    vi.mocked(patchEntry).mockResolvedValueOnce(fresh);
    // Mirrors AtlasPage: the dialog entry is a state snapshot, and onDone
    // re-renders the page with a reloaded list.
    function Page() {
      const [editEntry] = useState<AtlasEntryView | null>(edited);
      const [, setReloads] = useState(0);
      return createElement(EditEntryDialog, {
        open: editEntry !== null,
        atlasId: "atlas-1",
        entry: editEntry,
        onClose: () => {},
        onDone: () => setReloads((n) => n + 1),
      });
    }
    await render(createElement(Page));
    await typeInto(fieldByLabel("Vector role"), "Unsaved vector");
    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('button[aria-label="Reset Significance"]')!
        .click();
    });
    expect(fieldByLabel("Vector role").value).toBe("Unsaved vector");
    await submitForm();
    expect(patchEntry).toHaveBeenCalledWith("atlas-1", "e1", {
      fields: { vectorRole: "Unsaved vector" },
    });
  });

  it("keeps an out-of-vocabulary-order region list stable on tick then untick", async () => {
    const onClose = vi.fn();
    await render(
      editDialog({
        onClose,
        entry: entry({
          fields: {
            ...emptyParasiteFields(),
            group: "nematode",
            distributionRegions: ["asia", "europe"],
          },
        }),
      }),
    );
    const africa = [...document.body.querySelectorAll("label")]
      .find((l) => l.textContent === "Africa")!
      .querySelector("input")!;
    await act(async () => {
      africa.click();
    });
    expect(africa.checked).toBe(true);
    await act(async () => {
      africa.click();
    });
    await submitForm();
    expect(patchEntry).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a save error next to the actions, outside the scrolling content", async () => {
    vi.mocked(patchEntry).mockRejectedValueOnce(new Error("boom"));
    await render(editDialog());
    await typeInto(fieldByLabel("Vector role"), "Vector");
    await submitForm();
    const alert = document.body.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Could not save entry");
    expect(alert?.closest(".MuiDialogContent-root")).toBeNull();
  });

  it("clears the field error and a stale reset error after a successful reset", async () => {
    const edited = entry({
      originKey: "psoroptes-ovis",
      editedFields: ["pppDays"],
      fields: {
        ...emptyParasiteFields(),
        group: "arthropod",
        pppDays: { min: 1, max: 2 },
      } as AtlasEntryView["fields"],
    });
    vi.mocked(resetEntryFields)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ...edited,
        editedFields: [],
        fields: { ...edited.fields, pppDays: { min: 3, max: 4 } },
      });
    await render(editDialog({ entry: edited }));
    await typeInto(fieldByLabel("PPP min (days)"), "");
    await submitForm();
    const biology = () => document.getElementById("atlas-edit-biology")!;
    expect(biology().textContent).toContain(PPP_ERROR);
    const reset = () =>
      document.body.querySelector<HTMLButtonElement>(
        'button[aria-label="Reset Prepatent period"]',
      )!;
    await act(async () => {
      reset().click();
    });
    expect(document.body.textContent).toContain("Could not reset field");
    await act(async () => {
      reset().click();
    });
    expect(biology().textContent).not.toContain(PPP_ERROR);
    expect(document.body.textContent).not.toContain("Could not reset field");
    expect(fieldByLabel("PPP min (days)").value).toBe("3");
  });

  it("flags an added test row with a sample but no name instead of dropping it", async () => {
    await render(editDialog());
    await act(async () => {
      buttonNamed("Add test").click();
    });
    await typeInto(fieldByLabel("Sample (optional)"), "faeces");
    await submitForm();
    expect(patchEntry).not.toHaveBeenCalled();
    expect(document.getElementById("atlas-edit-diagnosis")?.textContent).toContain(
      DIAGNOSTIC_TEST_NAME_ERROR,
    );
  });

  it("runs afterSave after patchEntry with the sent patch and renders footerExtra", async () => {
    vi.mocked(patchEntry).mockResolvedValueOnce(entry());
    const afterSave = vi.fn().mockResolvedValue(undefined);
    const onDone = vi.fn();
    const onClose = vi.fn();
    await render(
      editDialog({
        onClose,
        onDone,
        afterSave,
        footerExtra: createElement("p", null, "Suggest slot"),
      }),
    );
    expect(document.body.textContent).toContain("Suggest slot");
    await typeInto(fieldByLabel("Vector role"), "Mechanical vector");
    await submitForm();
    const sent = { fields: { vectorRole: "Mechanical vector" } };
    expect(patchEntry).toHaveBeenCalledWith("atlas-1", "e1", sent);
    expect(afterSave).toHaveBeenCalledWith(sent);
    expect(vi.mocked(patchEntry).mock.invocationCallOrder[0]).toBeLessThan(
      afterSave.mock.invocationCallOrder[0],
    );
    expect(onDone.mock.invocationCallOrder[0]).toBeLessThan(
      afterSave.mock.invocationCallOrder[0],
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("still closes when afterSave rejects, and skips it when the patch fails", async () => {
    vi.mocked(patchEntry).mockResolvedValueOnce(entry());
    const afterSave = vi.fn().mockRejectedValue(new Error("offline"));
    const onClose = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(editDialog({ onClose, afterSave }));
    await typeInto(fieldByLabel("Vector role"), "Vector");
    await submitForm();
    expect(onClose).toHaveBeenCalled();
    warn.mockRestore();

    vi.mocked(patchEntry).mockRejectedValueOnce(new Error("boom"));
    afterSave.mockClear();
    await typeInto(fieldByLabel("Vector role"), "Vector two");
    await submitForm();
    expect(afterSave).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Could not save entry");
  });
});
