import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ProgressSnapshot } from "./types";

const COMPLETE_HOLD_MS = 180;

type ProgressRegistry = {
  active: ReadonlyMap<string, ProgressSnapshot>;
  upsert: (snapshot: ProgressSnapshot) => void;
  complete: (id: string) => void;
  fail: (id: string) => void;
  /** Prefer job-sourced ops when multiple are active. */
  primary: ProgressSnapshot | null;
};

const ProgressContext = createContext<ProgressRegistry | null>(null);

function pickPrimary(
  map: ReadonlyMap<string, ProgressSnapshot>,
): ProgressSnapshot | null {
  let client: ProgressSnapshot | null = null;
  for (const snap of map.values()) {
    if (snap.source === "job") return snap;
    if (!client) client = snap;
  }
  return client;
}

function clampPercent(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

type ProgressProviderProps = {
  children: ReactNode;
};

export function ProgressProvider({ children }: ProgressProviderProps) {
  const [active, setActive] = useState(
    () => new Map<string, ProgressSnapshot>(),
  );
  const activeRef = useRef(active);
  activeRef.current = active;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const remove = useCallback(
    (id: string) => {
      clearTimer(id);
      setActive((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    },
    [clearTimer],
  );

  const upsert = useCallback(
    (snapshot: ProgressSnapshot) => {
      clearTimer(snapshot.id);
      setActive((prev) => {
        const existing = prev.get(snapshot.id);
        let percent = clampPercent(snapshot.percent);
        if (
          existing &&
          snapshot.mode === "determinate" &&
          existing.mode === "determinate"
        ) {
          percent = Math.max(existing.percent, percent);
        }
        const next = new Map(prev);
        next.set(snapshot.id, { ...snapshot, percent });
        return next;
      });
    },
    [clearTimer],
  );

  const complete = useCallback(
    (id: string) => {
      clearTimer(id);
      const existing = activeRef.current.get(id);
      if (!existing) return;
      if (existing.mode === "determinate") {
        setActive((prev) => {
          const cur = prev.get(id);
          if (!cur) return prev;
          const next = new Map(prev);
          next.set(id, { ...cur, percent: 100 });
          return next;
        });
        const t = setTimeout(() => remove(id), COMPLETE_HOLD_MS);
        timers.current.set(id, t);
      } else {
        remove(id);
      }
    },
    [clearTimer, remove],
  );

  const fail = useCallback(
    (id: string) => {
      remove(id);
    },
    [remove],
  );

  const value = useMemo<ProgressRegistry>(
    () => ({
      active,
      upsert,
      complete,
      fail,
      primary: pickPrimary(active),
    }),
    [active, upsert, complete, fail],
  );

  return (
    <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>
  );
}

export function useProgressRegistry(): ProgressRegistry {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    throw new Error("useProgressRegistry must be used within ProgressProvider");
  }
  return ctx;
}
