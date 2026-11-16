import { useEffect } from "react";
import { useTrackedOp } from "./useTrackedOp";

/** Suspense fallback that drives the shell route loading overlay. */
export default function RouteSuspenseFallback({
  label = "Loading…",
}: {
  label?: string;
}) {
  const { begin, end } = useTrackedOp(label);
  useEffect(() => {
    begin();
    return () => end();
  }, [begin, end]);
  return null;
}
