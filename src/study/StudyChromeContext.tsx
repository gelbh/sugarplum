import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type StudyChromeValue = {
  hideChrome: boolean;
  setHideChrome: (hide: boolean) => void;
};

const StudyChromeContext = createContext<StudyChromeValue | null>(null);

export function StudyChromeProvider({ children }: { children: ReactNode }) {
  const [hideChrome, setHideChrome] = useState(false);
  const value = useMemo(
    () => ({ hideChrome, setHideChrome }),
    [hideChrome],
  );
  return (
    <StudyChromeContext.Provider value={value}>
      {children}
    </StudyChromeContext.Provider>
  );
}

export function useStudyChrome(): StudyChromeValue {
  const ctx = useContext(StudyChromeContext);
  if (!ctx) {
    throw new Error("useStudyChrome requires StudyChromeProvider");
  }
  return ctx;
}
