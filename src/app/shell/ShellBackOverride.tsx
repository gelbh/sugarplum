import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { shellBackHref } from "./shellBackHref";

type ShellBackHandler = () => void;

type ShellBackOverrideValue = {
  href: string | null;
  setHref: (href: string | null) => void;
  /** When set, TopChrome Back runs this instead of navigating `href`. */
  handler: ShellBackHandler | null;
  setHandler: (handler: ShellBackHandler | null) => void;
};

const ShellBackOverrideContext = createContext<ShellBackOverrideValue>({
  href: null,
  setHref: () => {},
  handler: null,
  setHandler: () => {},
});

export function ShellBackOverrideProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [href, setHref] = useState<string | null>(null);
  const [handler, setHandlerState] = useState<ShellBackHandler | null>(null);
  // Wrap so callers can pass the handler directly (not a useState updater).
  const setHandler = useCallback((next: ShellBackHandler | null) => {
    setHandlerState(() => next);
  }, []);
  const value = useMemo(
    () => ({ href, setHref, handler, setHandler }),
    [href, handler, setHandler],
  );
  return (
    <ShellBackOverrideContext.Provider value={value}>
      {children}
    </ShellBackOverrideContext.Provider>
  );
}

export function useShellBackOverride(): ShellBackOverrideValue {
  return useContext(ShellBackOverrideContext);
}

/** Nested override wins over pathname parent from `shellBackHref`. */
export function useResolvedShellBack(pathname: string): string | null {
  const { href: override } = useShellBackOverride();
  return override ?? shellBackHref(pathname);
}
