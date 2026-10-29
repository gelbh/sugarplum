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
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { ACHIEVEMENT_META } from "./catalog";
import { RipeningFruitMedal } from "./FruitMedal";
import { traitsForAchievement, type Rarity } from "./traits";
import { useStudyChrome } from "../study/StudyChromeContext";

const STAGE = "#1e0d1b";
const IVORY = "#e8d8c7";
const AMBER = "#C4A574";
const PLUM = "#5B2C6F";

const VISIBLE_MS = 3200;
const RIPEN_DELAY_MS = 80;

type ToastItem = {
  id: string;
  title: string;
  fruitType: (typeof ACHIEVEMENT_META)[string]["fruitType"];
  rarity: Rarity;
};

type UnlockToastContextValue = {
  enqueueUnlocks: (ids: string[]) => void;
};

const UnlockToastContext = createContext<UnlockToastContextValue | null>(null);

function idsToToasts(ids: string[]): ToastItem[] {
  const out: ToastItem[] = [];
  for (const id of ids) {
    const meta = ACHIEVEMENT_META[id];
    if (!meta) continue;
    out.push({
      id,
      title: meta.title,
      fruitType: meta.fruitType,
      rarity: meta.rarity,
    });
  }
  return out;
}

export function UnlockToastProvider({ children }: { children: ReactNode }) {
  const { hideChrome } = useStudyChrome();
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [active, setActive] = useState<ToastItem | null>(null);
  const [visible, setVisible] = useState(false);
  const [ripe, setRipe] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const enqueueUnlocks = useCallback((ids: string[]) => {
    const next = idsToToasts(ids);
    if (next.length === 0) return;
    setQueue((prev) => [...prev, ...next]);
  }, []);

  useEffect(() => {
    if (active || queue.length === 0) return;
    const [head, ...rest] = queue;
    setQueue(rest);
    setActive(head);
    setVisible(false);
    setRipe(false);
    setExiting(false);
    clearTimers();
    timers.current.push(
      window.setTimeout(() => setVisible(true), 16),
      window.setTimeout(() => setRipe(true), RIPEN_DELAY_MS),
      window.setTimeout(() => setExiting(true), VISIBLE_MS),
      window.setTimeout(() => {
        setVisible(false);
        setActive(null);
        setRipe(false);
        setExiting(false);
      }, VISIBLE_MS + 220),
    );
  }, [active, queue, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const value = useMemo(() => ({ enqueueUnlocks }), [enqueueUnlocks]);

  const traits = active ? traitsForAchievement(active.id, active.rarity) : null;

  const zen = hideChrome;

  return (
    <UnlockToastContext.Provider value={value}>
      {children}
      {active && traits ? (
        <Box
          aria-live="polite"
          sx={{
            position: "fixed",
            left: "50%",
            bottom: zen
              ? "calc(24px + env(safe-area-inset-bottom, 0px))"
              : "calc(88px + env(safe-area-inset-bottom, 0px))",
            transform: "translateX(-50%)",
            zIndex: 1400,
            pointerEvents: "none",
            width: "min(360px, calc(100vw - 32px))",
            opacity: visible && !exiting ? 1 : 0,
            translate: visible && !exiting ? "0 0" : "0 8px",
            transition:
              "opacity 400ms cubic-bezier(0.16, 1, 0.3, 1), translate 400ms cubic-bezier(0.16, 1, 0.3, 1)",
            "@media (prefers-reduced-motion: reduce)": {
              translate: "0 0",
              transition: "opacity 200ms ease",
            },
          }}
        >
          {zen ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 2,
                py: 1.5,
                borderRadius: 2,
                bgcolor: STAGE,
                color: IVORY,
                boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
                border: `1px solid rgba(196, 165, 116, 0.35)`,
              }}
            >
              <RipeningFruitMedal
                fruitType={active.fruitType}
                traits={traits}
                size={52}
                ripe={ripe}
              />
              <Box minWidth={0}>
                <Typography
                  variant="caption"
                  sx={{ color: AMBER, display: "block", mb: 0.25 }}
                >
                  Achievement unlocked
                </Typography>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 600, color: IVORY }}
                >
                  {active.title}
                </Typography>
              </Box>
            </Box>
          ) : (
            <Paper
              variant="outlined"
              elevation={4}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 2,
                py: 1.5,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <RipeningFruitMedal
                fruitType={active.fruitType}
                traits={traits}
                size={52}
                ripe={ripe}
              />
              <Box minWidth={0}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                >
                  Achievement unlocked
                </Typography>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 600, color: PLUM }}
                >
                  {active.title}
                </Typography>
              </Box>
            </Paper>
          )}
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
