import { createContext, useContext, type ReactNode } from "react";
import type { SessionUser } from "./resolveSession";

export type SessionValue = {
  user: SessionUser | null;
  refreshSession: () => Promise<void>;
  login: (
    email: string,
    password: string,
    turnstileToken: string,
  ) => Promise<SessionUser>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionValue;
  children: ReactNode;
}) {
  // ponytail: single memo lives at SessionBootstrap; avoid double-memo here
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession requires SessionProvider");
  }
  return ctx;
}

/** Narrow to non-null user under authenticated shell routes. */
export function useAuthenticatedSession(): SessionUser {
  const { user } = useSession();
  if (!user) {
    throw new Error("useAuthenticatedSession requires authenticated user");
  }
  return user;
}
