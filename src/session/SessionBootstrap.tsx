import { useEffect, useMemo, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import BareScroll from "../components/BareScroll";
import {
  resolveSession,
  type ResolveSessionResult,
  type SessionUser,
} from "./resolveSession";
import { sessionRouteDecision } from "./routePolicy";
import { GUEST_USER_ID } from "../guest/session";
import { SessionProvider } from "./SessionContext";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      status: "authenticated" | "unauthenticated";
      user: SessionUser | null;
    };

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
        <Typography color="text.secondary">
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

function decisionFor(pathname: string, phase: Phase) {
  if (phase.kind === "loading") return null;
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
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [ticket, setTicket] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    void (async () => {
      const result = await resolve();
      if (cancelled) return;
      if (result.status === "error") {
        setPhase({ kind: "error", message: result.message });
        return;
      }
      if (result.status === "authenticated") {
        setPhase({
          kind: "ready",
          status: "authenticated",
          user: result.user,
        });
        return;
      }
      setPhase({ kind: "ready", status: "unauthenticated", user: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [resolve, ticket]);

  useEffect(() => {
    if (phase.kind === "loading") return;
    const decision = decisionFor(pathname, phase);
    if (decision?.action === "redirect") {
      assign(decision.to);
    }
  }, [phase, pathname, assign]);

  const sessionValue = useMemo(
    () => ({
      user:
        phase.kind === "ready" && phase.status === "authenticated"
          ? phase.user
          : null,
    }),
    [phase],
  );

  if (phase.kind === "loading") {
    return <NeutralPending />;
  }

  const decision = decisionFor(pathname, phase);
  if (!decision || decision.action === "redirect" || decision.action === "pending") {
    if (phase.kind === "error" && decision?.action === "pending") {
      return (
        <NeutralPending
          message={phase.message}
          onRetry={() => setTicket((n) => n + 1)}
        />
      );
    }
    return <NeutralPending />;
  }

  return <SessionProvider value={sessionValue}>{children}</SessionProvider>;
}
