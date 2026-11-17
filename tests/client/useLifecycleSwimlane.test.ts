/**
 * @vitest-environment jsdom
 */
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bundledAtlasSource } from "../../src/atlas/bundledSource";
import { useLifecycleSwimlane } from "../../src/atlas/useLifecycleSwimlane";
import type { DatasetFields } from "../../src/atlas/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const entries = await bundledAtlasSource.list("subj_1");
const baseFields = entries.find((e) => e.id === "fasciola-hepatica")!.fields;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
  vi.useRealTimers();
});

type HookApi = ReturnType<typeof useLifecycleSwimlane>;

function mountHook(initial: DatasetFields): {
  get: () => HookApi;
  setFields: (next: DatasetFields) => void;
} {
  let latest: HookApi | null = null;
  let fields = initial;
  function Probe({ value }: { value: DatasetFields }) {
    const api = useLifecycleSwimlane(value);
    useEffect(() => {
      latest = api;
    });
    latest = api;
    return null;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  const render = (value: DatasetFields) => {
    act(() => {
      root.render(createElement(Probe, { value }));
    });
  };
  render(fields);
  return {
    get: () => {
      if (!latest) throw new Error("hook not mounted");
      return latest;
    },
    setFields: (next) => {
      fields = next;
      render(next);
    },
  };
}

describe("useLifecycleSwimlane", () => {
  it("clamps index when stages shrink", () => {
    const long = structuredClone(baseFields);
    const hook = mountHook(long);
    act(() => {
      hook.get().setIndex(long.lifecycleStages.length - 1);
    });
    expect(hook.get().index).toBe(long.lifecycleStages.length - 1);

    const short = structuredClone(baseFields);
    short.lifecycleStages = short.lifecycleStages.slice(0, 2);
    hook.setFields(short);
    expect(hook.get().index).toBe(1);
  });

  it("step clears playing", () => {
    const hook = mountHook(structuredClone(baseFields));
    act(() => {
      hook.get().setPlaying(true);
    });
    expect(hook.get().playing).toBe(true);
    act(() => {
      hook.get().step(1);
    });
    expect(hook.get().playing).toBe(false);
    expect(hook.get().index).toBe(1);
  });

  it("play advances then stops at last", () => {
    vi.useFakeTimers();
    const fields = structuredClone(baseFields);
    fields.lifecycleStages = fields.lifecycleStages.slice(0, 3);
    const hook = mountHook(fields);
    act(() => {
      hook.get().setPlaying(true);
    });
    expect(hook.get().playing).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(hook.get().index).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(hook.get().index).toBe(2);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(hook.get().index).toBe(2);
    expect(hook.get().playing).toBe(false);
  });
});
