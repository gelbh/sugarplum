/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnlockView } from "../../src/achievements/wire";
import {
  EXIT_MS,
  RIPEN_DELAY_MS,
  UnlockToastProvider,
  useUnlockToasts,
  VISIBLE_MS,
} from "../../src/achievements/UnlockToastProvider";
import { StudyChromeProvider } from "../../src/study/StudyChromeContext";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const unlock = (id: string, title: string): UnlockView => ({
  id,
  title,
  fruitType: "apple",
  rarity: "common",
  traits: { shine: "low", colour: "dull", status: "bruised" },
});

let enqueue: (u: readonly unknown[]) => void = () => {};
function Grab() {
  enqueue = useUnlockToasts().enqueueUnlocks;
  return null;
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(
      createElement(
        StudyChromeProvider,
        null,
        createElement(UnlockToastProvider, null, createElement(Grab)),
      ),
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const toast = () => document.querySelector<HTMLElement>('[role="status"]');
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("UnlockToastProvider", () => {
  it("shows queued unlocks one at a time in FIFO order", () => {
    act(() =>
      enqueue([
        unlock("reviews_1", "First bite"),
        unlock("accepts_1", "First zest"),
      ]),
    );
    expect(toast()?.textContent).toContain("First bite");
    advance(VISIBLE_MS + EXIT_MS);
    expect(toast()?.textContent).toContain("First zest");
    advance(VISIBLE_MS + EXIT_MS);
    expect(toast()).toBeNull();
  });

  it("ripens, exits, and holds a mid-toast enqueue until the exit ends", () => {
    act(() => enqueue([unlock("reviews_1", "First bite")]));
    advance(RIPEN_DELAY_MS);
    expect(toast()?.dataset.phase).toBe("ripe");
    act(() => enqueue([unlock("clear_due_1", "Empty basket")]));
    expect(toast()?.textContent).toContain("First bite");
    advance(VISIBLE_MS - RIPEN_DELAY_MS);
    expect(toast()?.dataset.phase).toBe("exit");
    expect(toast()?.textContent).toContain("First bite");
    advance(EXIT_MS);
    expect(toast()?.textContent).toContain("Empty basket");
  });

  it("ignores malformed unlock payloads", () => {
    act(() =>
      enqueue(["reviews_1", { title: "No traits", fruitType: "apple" }]),
    );
    expect(() => advance(RIPEN_DELAY_MS)).not.toThrow();
    expect(toast()).toBeNull();
  });
});
