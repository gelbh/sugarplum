/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import Cabinet from "../../src/atlas/hub/Cabinet";
import type { AtlasEntryView } from "../../src/atlas/types";
import { emptyParasiteFields } from "../../worker/atlas/templates/parasite";

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

function entry(): AtlasEntryView {
  const fields = emptyParasiteFields();
  fields.group = "nematode";
  return {
    id: "e1",
    originKey: "e1",
    canonicalName: "Alpha spp",
    commonName: null,
    aliases: [],
    fields,
    refs: [],
    images: [],
    editedAt: null,
    personalNote: null,
    tier: null,
    reason: null,
    override: null,
    focusMaterialIds: [],
  };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function renderCabinet(mobile: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(Cabinet, {
          entries: [entry()],
          userKey: "test",
          entryHref: (id) => `#${id}`,
          onOpenEntry: () => undefined,
          onCompare: () => undefined,
          stagger: false,
          mobile,
        }),
      ),
    );
  });
  await flush();
  return host;
}

describe("Cabinet mobile filters", () => {
  it("keeps filters in a bottom sheet below md", async () => {
    const host = await renderCabinet(true);
    expect(host.querySelector('[data-testid="atlas-filters-inline"]')).toBeNull();
    const opener = host.querySelector(
      'button[aria-label="Filters"]',
    ) as HTMLButtonElement;
    expect(opener).toBeTruthy();
    await act(async () => {
      opener.click();
    });
    await flush();
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("atlas-filters-sheet-title")).toBeTruthy();
  });

  it("keeps the inline filter strip at md+", async () => {
    const host = await renderCabinet(false);
    expect(host.querySelector('[data-testid="atlas-filters-inline"]')).toBeTruthy();
    expect(host.querySelector('button[aria-label="Filters"]')).toBeNull();
  });
});
