/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardFaceMcqBody } from "../../src/components/cardFaceMcq";
import { shuffledMcqOptions } from "../../src/study/mcqStudy";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CARD_ID = "card-mcq-1";
const OPTIONS = ["Paris", "Rome", "Madrid", "Berlin"];
const ANSWER = "Paris";

let root: Root;
let host: HTMLDivElement;
let onGrade: ReturnType<typeof vi.fn>;

const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
  });

const settle = () =>
  act(async () => {
    vi.advanceTimersByTime(650);
  });

beforeEach(() => {
  vi.useFakeTimers();
  onGrade = vi.fn(() => true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(
      createElement(CardFaceMcqBody, {
        cardId: CARD_ID,
        front: "Capital of France?",
        back: ANSWER,
        options: OPTIONS,
        onGrade,
      }),
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("CardFaceMcqBody keys", () => {
  it("picks the nth displayed option and grades after feedback", async () => {
    const shown = shuffledMcqOptions(CARD_ID, OPTIONS);
    press(String(shown.indexOf(ANSWER) + 1));
    expect(onGrade).not.toHaveBeenCalled();
    await settle();
    expect(onGrade).toHaveBeenCalledWith(3);
  });

  it("grades a wrong pick as Again and ignores keys while locked", async () => {
    const shown = shuffledMcqOptions(CARD_ID, OPTIONS);
    press(String(shown.findIndex((o) => o !== ANSWER) + 1));
    press(String(shown.indexOf(ANSWER) + 1));
    await settle();
    expect(onGrade).toHaveBeenCalledTimes(1);
    expect(onGrade).toHaveBeenCalledWith(1);
  });

  it("ignores out-of-range digits, repeats and modifier combos", async () => {
    press("5");
    press("1", { repeat: true });
    press("1", { metaKey: true });
    await settle();
    expect(onGrade).not.toHaveBeenCalled();
  });
});
