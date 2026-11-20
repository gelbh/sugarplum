import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { shellBackHref } from "./shellBackHref";

type ShellBackOverrideValue = {
  href: string | null;
  setHref: (href: string | null) => void;
};

const ShellBackOverrideContext = createContext<ShellBackOverrideValue>({
  href: null,
  setHref: () => {},
});

export function ShellBackOverrideProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [href, setHref] = useState<string | null>(null);
  const value = useMemo(() => ({ href, setHref }), [href]);
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
