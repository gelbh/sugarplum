import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { currentEntryKey } from "./navigate";

const STORAGE_KEY = "sugarplum.mainScroll";
const MAX_ENTRIES = 50;
const RESTORE_TIMEOUT_MS = 3000;
const CANCEL_EVENTS = ["wheel", "touchstart", "pointerdown"];

const offsets = new Map<string, number>();
let restoringKey: string | null = null;

export function savedOffset(key: string): number | undefined {
  return offsets.get(key);
}

/** Delete then set so Map order is recency. */
export function saveOffset(key: string, top: number): void {
  offsets.delete(key);
  offsets.set(key, top);
  for (const oldest of offsets.keys()) {
    if (offsets.size <= MAX_ENTRIES) break;
    offsets.delete(oldest);
  }
}

export function persistOffsets(storage: Pick<Storage, "setItem">): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...offsets]));
  } catch {
    // Private mode or quota: losing offsets only costs a scroll-to-top.
  }
}

export function hydrateOffsets(storage: Pick<Storage, "getItem">): void {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return;
    for (const pair of parsed) {
      if (
        Array.isArray(pair) &&
        typeof pair[0] === "string" &&
        typeof pair[1] === "number"
      ) {
        saveOffset(pair[0], pair[1]);
      }
    }
  } catch {
    // Corrupt or unavailable storage: start empty.
  }
}

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    // Blocked storage throws SecurityError on access.
    return undefined;
  }
}

if (typeof window !== "undefined") {
  const store = sessionStore();
  if (store) hydrateOffsets(store);
}

/**
 * Scrolls `el` to `target` once its content is tall enough. Gives up on user
 * input, timeout, or the returned stop; `onDone` runs exactly once.
 */
export function restoreWhenReady(
  el: HTMLElement,
  target: number,
  onDone: () => void,
  timeoutMs = RESTORE_TIMEOUT_MS,
): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const stop = () => {
    if (signal.aborted) return;
    controller.abort();
    observer.disconnect();
    clearTimeout(timer);
    onDone();
  };
  const tryRestore = () => {
    if (el.scrollHeight - el.clientHeight < target) return;
    el.scrollTo(0, target);
    stop();
  };
  // ponytail: re-checks on DOM mutations and image loads only; CSS-only growth is not observed.
  const observer = new MutationObserver(tryRestore);
  const timer = setTimeout(stop, timeoutMs);

  observer.observe(el, { childList: true, subtree: true, characterData: true });
  el.addEventListener("load", tryRestore, { capture: true, signal });
  for (const type of CANCEL_EVENTS) {
    el.addEventListener(type, stop, { passive: true, signal });
  }
  // Focus is often outside `<main>` after Back, so keys are watched on window.
  window.addEventListener("keydown", stop, { signal });
  tryRestore();
  return stop;
}

/**
 * `<main>` is the only scroller and persists across routes, so the browser never
 * saves or resets it. New entries start at top; Back/Forward restores the entry's
 * offset once async content is tall enough.
 */
export function useMainScrollRestore(
  mainRef: RefObject<HTMLElement | null>,
): void {
  const entryKey = currentEntryKey();
  const shownKey = useRef(entryKey);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const controller = new AbortController();
    const { signal } = controller;
    const persist = () => {
      const store = sessionStore();
      if (store) persistOffsets(store);
    };
    main.addEventListener(
      "scroll",
      () => {
        const key = currentEntryKey();
        // A deferred (transition) navigation updates history before the page renders; skip until it does.
        if (key !== shownKey.current) return;
        if (key !== restoringKey) saveOffset(key, main.scrollTop);
      },
      { passive: true, signal },
    );
    window.addEventListener("pagehide", persist, { signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") persist();
      },
      { signal },
    );
    return () => controller.abort();
  }, [mainRef]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    shownKey.current = entryKey;
    const target = savedOffset(entryKey) ?? 0;
    main.scrollTo(0, 0);
    if (target === 0) return;
    restoringKey = entryKey;
    return restoreWhenReady(main, target, () => {
      if (restoringKey === entryKey) restoringKey = null;
    });
  }, [mainRef, entryKey]);
}
