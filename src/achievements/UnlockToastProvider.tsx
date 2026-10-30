import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import FruitMedal from "./FruitMedal";
import { useStudyChrome } from "../study/StudyChromeContext";
import type { UnlockView } from "./wire";

export const ENTER_DELAY_MS = 16;
export const RIPEN_DELAY_MS = 80;
export const VISIBLE_MS = 3200;
export const EXIT_MS = 220;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const SKIN = {
  zen: {
    surface: {
      bgcolor: "#1e0d1b",
      color: "#e8d8c7",
      border: "1px solid rgba(196, 165, 116, 0.35)",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
    },
    kicker: "#C4A574",
    title: "#e8d8c7",
  },
  shell: {
    surface: {
      bgcolor: "background.paper",
      color: "text.primary",
      border: 1,
      borderColor: "divider",
      boxShadow: "0 6px 24px rgba(30, 13, 27, 0.12)",
    },
    kicker: "text.secondary",
    title: "primary.main",
  },
} as const;

type Phase = "enter" | "ripe" | "exit";

// A rolled-back Worker still returns unlock id strings instead of objects.
function isUnlockView(u: unknown): u is UnlockView {
  if (typeof u !== "object" || u === null) return false;
  const v = u as Partial<UnlockView>;
  return (
    typeof v.title === "string" &&
    typeof v.fruitType === "string" &&
    v.traits != null
  );
}

type UnlockToastContextValue = {
  enqueueUnlocks: (unlocks: UnlockView[]) => void;
};

const UnlockToastContext = createContext<UnlockToastContextValue | null>(null);

export function UnlockToastProvider({ children }: { children: ReactNode }) {
  const { hideChrome } = useStudyChrome();
  const [queue, setQueue] = useState<UnlockView[]>([]);
  const [active, setActive] = useState<UnlockView | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const enqueueUnlocks = useCallback((unlocks: UnlockView[]) => {
    const valid = unlocks.filter(isUnlockView);
    if (valid.length > 0) setQueue((prev) => [...prev, ...valid]);
  }, []);

  useEffect(() => {
    if (active || queue.length === 0) return;
    const [head, ...rest] = queue;
    setQueue(rest);
    setActive(head);
    setPhase(null);
    clearTimers();
    timers.current.push(
      window.setTimeout(() => setPhase("enter"), ENTER_DELAY_MS),
      window.setTimeout(() => setPhase("ripe"), RIPEN_DELAY_MS),
      window.setTimeout(() => setPhase("exit"), VISIBLE_MS),
      window.setTimeout(() => {
        setActive(null);
        setPhase(null);
      }, VISIBLE_MS + EXIT_MS),
    );
  }, [active, queue, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  const value = useMemo(() => ({ enqueueUnlocks }), [enqueueUnlocks]);
  const skin = hideChrome ? SKIN.zen : SKIN.shell;
  const shown = phase === "enter" || phase === "ripe";
  const ripe = phase === "ripe" || phase === "exit";

  return (
    <UnlockToastContext.Provider value={value}>
      {children}
      {active ? (
        <Box
          role="status"
          aria-live="polite"
          data-phase={phase ?? "pending"}
          sx={{
            position: "fixed",
            left: "50%",
            bottom: hideChrome
              ? "calc(24px + env(safe-area-inset-bottom, 0px))"
              : "calc(88px + env(safe-area-inset-bottom, 0px))",
            transform: "translateX(-50%)",
            zIndex: 1400,
            pointerEvents: "none",
            width: "min(360px, calc(100vw - 32px))",
            opacity: shown ? 1 : 0,
            translate: shown ? "0 0" : "0 8px",
            transition: shown
              ? `opacity 400ms ${EASE}, translate 400ms ${EASE}`
              : `opacity ${EXIT_MS}ms ease-in, translate ${EXIT_MS}ms ease-in`,
            "@media (prefers-reduced-motion: reduce)": {
              translate: "0 0",
              transition: "opacity 200ms ease",
            },
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 2,
              py: 1.5,
              borderRadius: 2,
              ...skin.surface,
            }}
          >
            <FruitMedal
              fruitType={active.fruitType}
              traits={active.traits}
              size={52}
              locked={!ripe}
              glow={ripe}
            />
            <Box minWidth={0}>
              <Typography
                variant="caption"
                sx={{ color: skin.kicker, display: "block", mb: 0.25 }}
              >
                Achievement unlocked
              </Typography>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, color: skin.title }}
              >
                {active.title}
              </Typography>
            </Box>
          </Box>
        </Box>
      ) : null}
    </UnlockToastContext.Provider>
  );
}

export function useUnlockToasts(): UnlockToastContextValue {
  const ctx = useContext(UnlockToastContext);
  if (!ctx) {
    throw new Error("useUnlockToasts requires UnlockToastProvider");
  }
  return ctx;
}
