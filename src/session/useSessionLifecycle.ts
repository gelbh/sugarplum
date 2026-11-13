import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
} from "../api/client";
import { GUEST_USER_ID } from "../guest/session";
import {
  resolveSession,
  type ResolveSessionResult,
  type SessionUser,
} from "./resolveSession";
import type { SessionValue } from "./SessionContext";
import { postSessionHint, subscribeSessionSync } from "./sessionSync";

const REFRESH_THROTTLE_MS = 60_000;
/** Collapse BC+storage double-fire (login clears guest then posts hint). */
const SYNC_HINT_COALESCE_MS = 1_000;

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

function isReadyGuest(phase: SessionPhase): boolean {
  return (
    phase.kind === "ready" &&
    phase.status === "authenticated" &&
    phase.user?.id === GUEST_USER_ID
  );
}

/** Resolve, visibility refresh, cross-tab sync, and auth mutations for SessionBootstrap. */
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
  const lastHintAtRef = useRef(0);
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
      if (isReadyGuest(phaseRef.current)) return;
      void runResolve({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [runResolve]);

  const refreshSession = useCallback(async () => {
    await runResolve({ silent: true, force: true });
  }, [runResolve]);

  useEffect(() => {
    return subscribeSessionSync(() => {
      const now = Date.now();
      if (now - lastHintAtRef.current < SYNC_HINT_COALESCE_MS) return;
      lastHintAtRef.current = now;
      void runResolve({ silent: true, force: true });
    });
  }, [runResolve]);

  const completeAuthMutation = useCallback(
    async (mutate: () => Promise<SessionUser>) => {
      const user = await mutate();
      await refreshSession();
      postSessionHint();
      return user;
    },
    [refreshSession],
  );

  const login = useCallback(
    (email: string, password: string, turnstileToken: string) =>
      completeAuthMutation(() => loginApi(email, password, turnstileToken)),
    [completeAuthMutation],
  );

  const register = useCallback(
    (email: string, password: string, turnstileToken: string) =>
      completeAuthMutation(() => registerApi(email, password, turnstileToken)),
    [completeAuthMutation],
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
      postSessionHint();
    } finally {
      loggingOutRef.current = false;
    }
  }, []);

  const sessionValue = useMemo<SessionValue>(() => {
    const user =
      phase.kind === "ready" && phase.status === "authenticated"
        ? phase.user
        : null;
    return { user, refreshSession, login, logout, register };
  }, [phase, refreshSession, login, logout, register]);

  const retry = useCallback(() => setTicket((n) => n + 1), []);

  return { phase, sessionValue, retry };
}
