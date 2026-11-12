import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { SessionUser } from "./resolveSession";

export type SessionValue = {
  user: SessionUser | null;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionValue;
  children: ReactNode;
}) {
  const memo = useMemo(() => value, [value.user]);
  return (
    <SessionContext.Provider value={memo}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession requires SessionProvider");
  }
  return ctx;
}
