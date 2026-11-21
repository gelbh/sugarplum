/**
 * @vitest-environment jsdom
 */
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AtlasEntryView, EntryPatch } from "../../src/atlas/types";
import { emptyParasiteFields } from "../../worker/atlas/templates/parasite";

vi.mock("../../src/atlas/corrections/apiCorrections", () => ({
  postEntrySuggestion: vi.fn(),
}));

import { ApiError } from "../../src/api/client";
import { postEntrySuggestion } from "../../src/atlas/corrections/apiCorrections";
import { useCorrectionSuggestion } from "../../src/atlas/corrections/useCorrectionSuggestion";

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
  vi.clearAllMocks();
});

function entry(originKey: string | null): AtlasEntryView {
  return {
    id: originKey ?? "learner-1",
    originKey,
    canonicalName: "Psoroptes ovis",
    commonName: "Sheep scab mite",
    aliases: [],
    learnerAliases: [],
    fields: emptyParasiteFields() as AtlasEntryView["fields"],
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
  };
}

let afterSave: (patch: EntryPatch) => Promise<void> = async () => {};
let saveBlocked = false;

function Harness(props: { entry: AtlasEntryView; onSent: () => void }) {
  const hook = useCorrectionSuggestion({ atlasId: "atlas-1", ...props });
  afterSave = hook.afterSave;
  saveBlocked = hook.saveBlocked;
  return createElement(Fragment, null, hook.footerExtra, hook.toast);
}

async function render(e: AtlasEntryView, onSent = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(createElement(Harness, { entry: e, onSent }));
  });
  return onSent;
}

function setInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto = Object.getPrototypeOf(input) as object;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function tick() {
  const box = document.body.querySelector(
    'input[type="checkbox"]',
  ) as HTMLInputElement;
  await act(async () => {
    box.click();
  });
}

const PATCH: EntryPatch = { fields: { significance: "Causes sheep scab." } };

describe("useCorrectionSuggestion", () => {
  it("renders nothing for learner-added entries", async () => {
    await render(entry(null));
    expect(document.body.textContent).not.toContain("Suggest this correction");
  });

  it("does not POST when the box is unticked", async () => {
    await render(entry("psoroptes-ovis"));
    await act(async () => {
      await afterSave(PATCH);
    });
    expect(postEntrySuggestion).not.toHaveBeenCalled();
  });

  it("POSTs the patch, note and link when ticked", async () => {
    vi.mocked(postEntrySuggestion).mockResolvedValueOnce({
      status: "open",
      diff: {},
    });
    const onSent = await render(entry("psoroptes-ovis"));
    expect(document.body.textContent).toContain(
      "Suggest this correction for everyone",
    );
    await tick();
    const note = document.body.querySelector(
      "textarea",
    ) as HTMLTextAreaElement;
    const link = document.body.querySelector(
      'input[type="url"]',
    ) as HTMLInputElement;
    await act(async () => {
      setInput(note, " From the WOAH manual ");
      setInput(link, "https://example.org/scab");
    });
    await act(async () => {
      await afterSave(PATCH);
    });
    expect(postEntrySuggestion).toHaveBeenCalledWith(
      "atlas-1",
      "psoroptes-ovis",
      {
        patch: PATCH,
        note: "From the WOAH manual",
        sourceUrl: "https://example.org/scab",
      },
    );
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it("shows the toast on failure without throwing, and Retry re-sends", async () => {
    vi.mocked(postEntrySuggestion)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ status: "open", diff: {} });
    const onSent = await render(entry("psoroptes-ovis"));
    await tick();
    await act(async () => {
      await expect(afterSave(PATCH)).resolves.toBeUndefined();
    });
    expect(document.body.textContent).toContain(
      "Saved for you; the suggestion did not send",
    );
    const retry = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Retry",
    )!;
    await act(async () => {
      retry.click();
    });
    expect(postEntrySuggestion).toHaveBeenCalledTimes(2);
    expect(vi.mocked(postEntrySuggestion).mock.calls[1]).toEqual(
      vi.mocked(postEntrySuggestion).mock.calls[0],
    );
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it("blocks Save and never POSTs while the link is not http(s)", async () => {
    await render(entry("psoroptes-ovis"));
    await tick();
    const link = document.body.querySelector(
      'input[type="url"]',
    ) as HTMLInputElement;
    await act(async () => {
      setInput(link, "ftp://example.org/scab");
    });
    expect(saveBlocked).toBe(true);
    await act(async () => {
      await afterSave(PATCH);
    });
    expect(postEntrySuggestion).not.toHaveBeenCalled();
    await act(async () => {
      setInput(link, "https://example.org/scab");
    });
    expect(saveBlocked).toBe(false);
  });

  it("shows the server reason and no Retry when the request is rejected", async () => {
    vi.mocked(postEntrySuggestion).mockRejectedValueOnce(
      new ApiError(400, "No changes from the dataset"),
    );
    await render(entry("psoroptes-ovis"));
    await tick();
    await act(async () => {
      await afterSave(PATCH);
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Saved for you; the suggestion did not send");
    expect(text).toContain("No changes from the dataset");
    const retry = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Retry",
    );
    expect(retry).toBeUndefined();
  });
});
