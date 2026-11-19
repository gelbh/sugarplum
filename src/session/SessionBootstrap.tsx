import { useEffect, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import BareScroll from "../app/BareScroll";
import {
  resolveSession,
  type ResolveSessionResult,
} from "./resolveSession";
import { sessionRouteDecision } from "./routePolicy";
import { GUEST_USER_ID } from "../guest/session";
import { SessionProvider } from "./SessionContext";
import {
  useSessionLifecycle,
  type SessionPhase,
} from "./useSessionLifecycle";

type SessionBootstrapProps = {
  pathname: string;
  children: ReactNode;
  resolve?: () => Promise<ResolveSessionResult>;
  assign?: (url: string) => void;
};

const defaultAssign = (url: string) => {
  window.location.assign(url);
};

function NeutralPending({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <BareScroll>
      <Box
        sx={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          p: 2,
          gap: 2,
        }}
      >
        <Typography sx={{
          color: "text.secondary"
        }}>
          {message ?? "Loading…"}
        </Typography>
        {onRetry ? (
          <Button variant="outlined" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </Box>
    </BareScroll>
  );
}

function decisionFor(pathname: string, phase: SessionPhase) {
  if (phase.kind === "loading") {
    return sessionRouteDecision(pathname, "loading");
  }
  if (phase.kind === "error") {
    return sessionRouteDecision(pathname, "error");
  }
  const guest = phase.user?.id === GUEST_USER_ID;
  return sessionRouteDecision(pathname, phase.status, { guest });
}

export default function SessionBootstrap({
  pathname,
  children,
  resolve = resolveSession,
  assign = defaultAssign,
}: SessionBootstrapProps) {
  const { phase, sessionValue, retry } = useSessionLifecycle(resolve);

  useEffect(() => {
    if (phase.kind === "loading") return;
    const decision = decisionFor(pathname, phase);
    if (decision.action === "redirect") {
      assign(decision.to);
    }
  }, [phase, pathname, assign]);

  const decision = decisionFor(pathname, phase);
  if (decision.action === "allow") {
    return <SessionProvider value={sessionValue}>{children}</SessionProvider>;
  }
  if (phase.kind === "error" && decision.action === "pending") {
    return (
      <NeutralPending message={phase.message} onRetry={retry} />
    );
  }
  return <NeutralPending />;
}
