import { useEffect, useLayoutEffect, type RefObject } from "react";
import { currentEntryKey, locationKey } from "./navigate";

const STORAGE_KEY = "sugarplum.mainScroll";
const MAX_ENTRIES = 50;
const RESTORE_TIMEOUT_MS = 3000;
const CANCEL_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"];

const offsets = new Map<string, number>();

export function savedOffset(key: string): number | undefined {
  return offsets.get(key);
}

/** Delete then set so Map order is recency. */
export function saveOffset(key: string, top: number): void {
  offsets.delete(key);
  offsets.set(key, top);
}

export function persistOffsets(storage: Pick<Storage, "setItem">): void {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([...offsets].slice(-MAX_ENTRIES)),
    );
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

if (typeof sessionStorage !== "undefined") hydrateOffsets(sessionStorage);

/**
 * `<main>` is the only scroller and persists across routes, so the browser never
 * saves or resets it. New entries start at top; Back/Forward restores the entry's
 * offset once async content is tall enough.
 */
export function useMainScrollRestore(
  mainRef: RefObject<HTMLElement | null>,
): void {
  const locKey = locationKey();
  const rawEntryKey = (window.history.state as { key?: string } | null)?.key;

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const onScroll = () => saveOffset(currentEntryKey(), main.scrollTop);
    const onPageHide = () => persistOffsets(sessionStorage);
    main.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    return () => {
      main.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [mainRef]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const target = savedOffset(currentEntryKey()) ?? 0;
    main.scrollTo(0, 0);
    if (target === 0) return;

    const tryRestore = () => {
      if (main.scrollHeight - main.clientHeight < target) return;
      main.scrollTo(0, target);
      stop();
    };
    // ponytail: re-checks on DOM mutations and image loads only; CSS-only growth is not observed.
    const observer = new MutationObserver(tryRestore);
    const timer = setTimeout(() => stop(), RESTORE_TIMEOUT_MS);
    const stop = () => {
      observer.disconnect();
      clearTimeout(timer);
      main.removeEventListener("load", tryRestore, true);
      for (const type of CANCEL_EVENTS) main.removeEventListener(type, stop);
    };

    observer.observe(main, { childList: true, subtree: true, characterData: true });
    main.addEventListener("load", tryRestore, true);
    for (const type of CANCEL_EVENTS) {
      main.addEventListener(type, stop, { passive: true });
    }
    tryRestore();
    return stop;
  }, [mainRef, locKey, rawEntryKey]);
}
