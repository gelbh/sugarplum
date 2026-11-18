import { useEffect, type ReactNode } from "react";
import { atlasHubHref } from "../atlas/paths";
import { navigateReplace } from "../nav/navigate";
import { useSession } from "../session/SessionContext";
import { sessionAnatomyViewerEnabled } from "./anatomyViewerAccess";

/** Redirect away from `/anatomy*` when the session is not allowlisted. */
export default function AnatomyViewerGate({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useSession();
  const enabled = sessionAnatomyViewerEnabled(user);

  useEffect(() => {
    if (!enabled) navigateReplace(atlasHubHref());
  }, [enabled]);

  if (!enabled) return null;
  return children;
}
