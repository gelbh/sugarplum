export type WorkshopViewMode = "icons" | "details";

export const PILL_BTN = {
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  boxShadow: "none",
  "&:hover": { boxShadow: "none" },
} as const;

export const ROW_ACTION = {
  color: "rgba(232, 216, 199, 0.55)",
  "&:hover": {
    color: "primary.light",
    bgcolor: "rgba(91, 44, 111, 0.28)",
  },
} as const;

export const WORKSHOP_SURFACE = {
  borderRadius: 2,
  border: "1px solid",
  borderColor: "rgba(232, 216, 199, 0.12)",
  bgcolor: "rgba(18, 7, 15, 0.28)",
} as const;

export function createWorkshopViewPref(storageKey: string) {
  function readViewMode(): WorkshopViewMode {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "icons" || raw === "details") return raw;
    } catch {
      /* ignore */
    }
    return "icons";
  }

  function writeViewMode(mode: WorkshopViewMode) {
    try {
      localStorage.setItem(storageKey, mode);
    } catch {
      /* ignore */
    }
  }

  return { readViewMode, writeViewMode };
}
