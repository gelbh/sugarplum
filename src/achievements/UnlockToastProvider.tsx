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
import { ACHIEVEMENT_META, type FruitType } from "./catalog";
import { RipeningFruitMedal } from "./FruitMedal";
import { traitsForAchievement, type Rarity } from "./traits";
import { useStudyChrome } from "../study/StudyChromeContext";

const ENTER_DELAY_MS = 16;
const RIPEN_DELAY_MS = 80;
const VISIBLE_MS = 3200;
const EXIT_MS = 220;
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

type ToastItem = {
  id: string;
  title: string;
  fruitType: FruitType;
  rarity: Rarity;
};

type Phase = "enter" | "ripe" | "exit";

type UnlockToastContextValue = {
  enqueueUnlocks: (ids: string[]) => void;
};

const UnlockToastContext = createContext<UnlockToastContextValue | null>(null);

function idsToToasts(ids: string[]): ToastItem[] {
  return ids.flatMap((id) => {
    const meta = ACHIEVEMENT_META[id];
    return meta ? [{ id, ...meta }] : [];
  });
}

export function UnlockToastProvider({ children }: { children: ReactNode }) {
  const { hideChrome } = useStudyChrome();
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [active, setActive] = useState<ToastItem | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const enqueueUnlocks = useCallback((ids: string[]) => {
    const next = idsToToasts(ids);
    if (next.length > 0) setQueue((prev) => [...prev, ...next]);
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

  return (
    <UnlockToastContext.Provider value={value}>
      {children}
      {active ? (
        <Box
          role="status"
          aria-live="polite"
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
            <RipeningFruitMedal
              fruitType={active.fruitType}
              traits={traitsForAchievement(active.id, active.rarity)}
              size={52}
              ripe={phase === "ripe" || phase === "exit"}
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
