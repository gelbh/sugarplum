import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  login as loginApi,
  logout as logoutApi,
} from "../api/client";
import {
  resolveSession,
  type ResolveSessionResult,
  type SessionUser,
} from "./resolveSession";
import type { SessionValue } from "./SessionContext";

const REFRESH_THROTTLE_MS = 60_000;

export type SessionPhase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      status: "authenticated" | "unauthenticated";
      user: SessionUser | null;
    };

function applyResolveResult(
  result: ResolveSessionResult,
  silent: boolean,
  prev: SessionPhase,
): SessionPhase {
  if (result.status === "error") {
    if (silent && prev.kind === "ready") return prev;
    return { kind: "error", message: result.message };
  }
  if (result.status === "authenticated") {
    return {
      kind: "ready",
      status: "authenticated",
      user: result.user,
    };
  }
  return { kind: "ready", status: "unauthenticated", user: null };
}

/** Resolve, visibility refresh, and auth mutations for SessionBootstrap. */
export function useSessionLifecycle(
  resolve: () => Promise<ResolveSessionResult> = resolveSession,
): {
  phase: SessionPhase;
  sessionValue: SessionValue;
  retry: () => void;
} {
  const [phase, setPhase] = useState<SessionPhase>({ kind: "loading" });
  const [ticket, setTicket] = useState(0);
  const phaseRef = useRef<SessionPhase>(phase);
  const genRef = useRef(0);
  const lastSyncRef = useRef(0);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const runResolve = useCallback(
    async (opts: { silent: boolean; force?: boolean }) => {
      if (loggingOutRef.current) return;
      if (
        opts.silent &&
        !opts.force &&
        Date.now() - lastSyncRef.current < REFRESH_THROTTLE_MS
      ) {
        return;
      }
      const gen = ++genRef.current;
      if (!opts.silent) {
        setPhase({ kind: "loading" });
      }
      const result = await resolve();
      if (loggingOutRef.current || gen !== genRef.current) return;
      lastSyncRef.current = Date.now();
      setPhase((prev) => applyResolveResult(result, opts.silent, prev));
    },
    [resolve],
  );

  useEffect(() => {
    void runResolve({ silent: false });
  }, [runResolve, ticket]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (phaseRef.current.kind !== "ready") return;
      void runResolve({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [runResolve]);

  const refreshSession = useCallback(async () => {
    await runResolve({ silent: true, force: true });
  }, [runResolve]);

  const login = useCallback(
    async (email: string, password: string, turnstileToken: string) => {
      const user = await loginApi(email, password, turnstileToken);
      await refreshSession();
      return user;
    },
    [refreshSession],
  );

  const logout = useCallback(async () => {
    loggingOutRef.current = true;
    genRef.current += 1;
    try {
      await logoutApi();
      lastSyncRef.current = Date.now();
      const next: SessionPhase = {
        kind: "ready",
        status: "unauthenticated",
        user: null,
      };
      phaseRef.current = next;
      setPhase(next);
    } finally {
      loggingOutRef.current = false;
    }
  }, []);

  const sessionValue = useMemo<SessionValue>(() => {
    const user =
      phase.kind === "ready" && phase.status === "authenticated"
        ? phase.user
        : null;
    return { user, refreshSession, login, logout };
  }, [phase, refreshSession, login, logout]);

  const retry = useCallback(() => setTicket((n) => n + 1), []);

  return { phase, sessionValue, retry };
}
