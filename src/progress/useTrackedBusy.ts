import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useProgressRegistry } from "./ProgressProvider";

type UseTrackedBusyOptions = {
  /** Start an indeterminate client op on mount until `end()` / unmount. */
  trackOnMount?: boolean;
};

/**
 * Indeterminate global-bar tracking for short page loads and button busy.
 * Never invents a percent.
 */
export function useTrackedBusy(
  label: string,
  options: UseTrackedBusyOptions = {},
) {
  const { trackOnMount = false } = options;
  const { upsert, complete, fail } = useProgressRegistry();
  const reactId = useId();
  const idRef = useRef(`busy:${reactId}`);
  const [busy, setBusy] = useState(trackOnMount);
  const labelRef = useRef(label);
  const activeRef = useRef(false);

  useEffect(() => {
    labelRef.current = label;
  }, [label]);

  const begin = useCallback(
    (overrideLabel?: string) => {
      activeRef.current = true;
      setBusy(true);
      upsert({
        id: idRef.current,
        label: overrideLabel ?? labelRef.current,
        mode: "indeterminate",
        percent: 0,
        source: "client",
      });
    },
    [upsert],
  );

  const end = useCallback(
    (ok = true) => {
      if (!activeRef.current) {
        setBusy(false);
        return;
      }
      activeRef.current = false;
      setBusy(false);
      if (ok) complete(idRef.current);
      else fail(idRef.current);
    },
    [complete, fail],
  );

  useEffect(() => {
    if (!trackOnMount) return;
    begin();
    return () => {
      if (activeRef.current) {
        activeRef.current = false;
        fail(idRef.current);
      }
    };
  }, [trackOnMount, begin, fail]);

  return { busy, begin, end };
}
