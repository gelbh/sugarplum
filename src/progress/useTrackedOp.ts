import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useProgressRegistry } from "./ProgressProvider";
import {
  runTracked,
  type RunTrackedOptions,
  type TrackedRunContext,
} from "./runTracked";

type UseTrackedOpOptions = {
  /** Start an indeterminate client op on mount until `end()` / unmount. */
  trackOnMount?: boolean;
};

type RunOptions = Omit<RunTrackedOptions, "label"> & { label?: string };

/**
 * Client progress tracking: indeterminate busy and determinate upload.
 * Prefer `run` so complete/fail always settle; `begin`/`end` for mount loads.
 */
export function useTrackedOp(
  defaultLabel: string,
  options: UseTrackedOpOptions = {},
) {
  const { trackOnMount = false } = options;
  const { upsert, complete, fail } = useProgressRegistry();
  const reactId = useId();
  const idRef = useRef(`op:${reactId}`);
  const [busy, setBusy] = useState(trackOnMount);
  const labelRef = useRef(defaultLabel);
  const activeRef = useRef(false);

  useEffect(() => {
    labelRef.current = defaultLabel;
  }, [defaultLabel]);

  const begin = useCallback(
    (overrideLabel?: string) => {
      const label = overrideLabel ?? labelRef.current;
      labelRef.current = label;
      activeRef.current = true;
      setBusy(true);
      upsert({
        id: idRef.current,
        label,
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

  const run = useCallback(
    async <T>(
      fn: (ctx: TrackedRunContext) => Promise<T>,
      runOptions: RunOptions = {},
    ): Promise<T> => {
      const label = runOptions.label ?? labelRef.current;
      const mode = runOptions.mode ?? "indeterminate";
      activeRef.current = true;
      setBusy(true);
      try {
        return await runTracked({ upsert, complete, fail }, idRef.current, fn, {
          label,
          mode,
        });
      } finally {
        activeRef.current = false;
        setBusy(false);
      }
    },
    [upsert, complete, fail],
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

  return { busy, begin, end, run };
}
