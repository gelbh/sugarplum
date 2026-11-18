import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeLocation } from "../nav/navigate";
import { useProgressRegistry } from "./ProgressProvider";
import { useSpinDelay } from "./spinDelay";
import type { ProgressSnapshot } from "./types";

/** Overlay only after mid-tier bar window; bar uses GlobalProgressBar 200ms delay. */
export const ROUTE_OVERLAY_SHOW_TIMING = { delay: 800, minDuration: 300 };
const BRIDGE_MS = 90;

function isRouteLoadOp(snap: ProgressSnapshot): boolean {
  return snap.source === "client" && /^Loading\b/i.test(snap.label);
}

/**
 * Bridges the tick between navigate and trackOnMount begin(), then follows
 * client "Loading…" ops with spin delay. Mid waits use GlobalProgressBar;
 * this hook only drives the heavy overlay after 800ms.
 */
export function useRouteLoadOverlay(): ProgressSnapshot | null {
  const { active } = useProgressRegistry();
  const [bridging, setBridging] = useState(false);
  const hadLoadRef = useRef(false);

  useEffect(
    () =>
      subscribeLocation(() => {
        hadLoadRef.current = false;
        setBridging(true);
      }),
    [],
  );

  const loadOp = useMemo(() => {
    for (const snap of active.values()) {
      if (isRouteLoadOp(snap)) return snap;
    }
    return null;
  }, [active]);

  useEffect(() => {
    if (loadOp) {
      hadLoadRef.current = true;
      return;
    }
    if (!bridging) return;
    if (hadLoadRef.current) {
      setBridging(false);
      hadLoadRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      setBridging(false);
    }, BRIDGE_MS);
    return () => clearTimeout(t);
  }, [bridging, loadOp]);

  const pending: ProgressSnapshot | null =
    loadOp ??
    (bridging
      ? {
          id: "route-bridge",
          label: "Loading…",
          mode: "indeterminate",
          percent: 0,
          source: "client",
        }
      : null);

  return useSpinDelay(pending, ROUTE_OVERLAY_SHOW_TIMING);
}
