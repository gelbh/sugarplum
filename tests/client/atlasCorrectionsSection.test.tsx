/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminAtlasCorrection } from "../../src/atlas/types";

vi.mock("../../src/atlas/corrections/apiCorrections", async (orig) => ({
  ...(await orig<
    typeof import("../../src/atlas/corrections/apiCorrections")
  >()),
  adminListAtlasCorrections: vi.fn(),
  adminResolveAtlasCorrection: vi.fn(),
}));

import {
  adminListAtlasCorrections,
  adminResolveAtlasCorrection,
} from "../../src/atlas/corrections/apiCorrections";
import AtlasCorrectionsSection from "../../src/atlas/corrections/AtlasCorrectionsSection";

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

const ROW: AdminAtlasCorrection = {
  id: "s1",
  originKey: "psoroptes-ovis",
  canonicalName: "Psoroptes ovis",
  commonName: "Sheep scab mite",
  datasetVersion: 9,
  diff: { significance: { from: "Old text", to: "New text" } },
  note: "Per lecture",
  sourceUrl: "https://example.org/scab",
  status: "open",
  createdAt: "2026-11-20T00:00:00.000Z",
  resolvedAt: null,
  studentEmail: "a@example.com",
};

async function render() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(createElement(AtlasCorrectionsSection));
  });
  return host;
}

function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  )!;
}

describe("AtlasCorrectionsSection", () => {
  it("renders parasite, diff, note, link and email", async () => {
    vi.mocked(adminListAtlasCorrections).mockResolvedValueOnce([ROW]);
    const host = await render();
    expect(adminListAtlasCorrections).toHaveBeenCalledWith("open");
    const text = host.textContent ?? "";
    expect(text).toContain("Atlas corrections");
    expect(text).toContain("Psoroptes ovis");
    expect(text).toContain("Old text");
    expect(text).toContain("New text");
    expect(text).toContain("Per lecture");
    expect(text).toContain("a@example.com");
    expect(
      host.querySelector('a[href="https://example.org/scab"]'),
    ).toBeTruthy();
  });

  it("copies the dataset JSON without the student email", async () => {
    vi.mocked(adminListAtlasCorrections).mockResolvedValueOnce([ROW]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const host = await render();
    await act(async () => {
      button(host, "Copy as JSON").click();
    });
    const copied = JSON.parse(writeText.mock.calls[0][0] as string);
    expect(copied).toMatchObject({
      originKey: "psoroptes-ovis",
      diff: ROW.diff,
    });
    expect(JSON.stringify(copied)).not.toContain("a@example.com");
  });

  it("accepts and removes the row", async () => {
    vi.mocked(adminListAtlasCorrections).mockResolvedValueOnce([ROW]);
    vi.mocked(adminResolveAtlasCorrection).mockResolvedValueOnce({
      id: "s1",
      status: "accepted",
      resolvedAt: "2026-11-20T01:00:00.000Z",
    });
    const host = await render();
    await act(async () => {
      button(host, "Accept").click();
    });
    expect(adminResolveAtlasCorrection).toHaveBeenCalledWith("s1", "accepted");
    expect(host.textContent).not.toContain("Psoroptes ovis");
    expect(host.textContent).toContain("No open suggestions.");
  });
});
