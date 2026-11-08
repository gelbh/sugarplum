import { useEffect } from "react";
import { useTrackedOp } from "../progress/useTrackedOp";

export default function AtlasLoading() {
  // trackOnMount would mark the op failed when the fallback unmounts.
  const { begin, end } = useTrackedOp("Loading Atlas…");
  useEffect(() => {
    begin();
    return () => end();
  }, [begin, end]);
  return null;
}
