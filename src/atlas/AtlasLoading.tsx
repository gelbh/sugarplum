import { useEffect } from "react";
import { useTrackedOp } from "../progress/useTrackedOp";

/** Suspense fallback: reports the Atlas chunk wait as one completed op. */
export default function AtlasLoading() {
  // trackOnMount would mark the op failed when the fallback unmounts.
  const { begin, end } = useTrackedOp("Loading Atlas…");
  useEffect(() => {
    begin();
    return () => end();
  }, [begin, end]);
  return null;
}
