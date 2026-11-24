export const DIALOG_PAPER_SX = {
  borderRadius: 2,
  overflow: "hidden",
  bgcolor: "background.paper",
} as const;

export const DIALOG_TITLE_SX = {
  p: 0,
  fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
  fontWeight: 400,
  letterSpacing: "0.02em",
  lineHeight: 1.2,
  fontSize: "1.65rem",
} as const;

export const DIALOG_CANCEL_SX = {
  color: "text.secondary",
  textTransform: "none",
  fontWeight: 500,
  "&:hover": { color: "text.primary", bgcolor: "transparent" },
} as const;

export const PRIMARY_PILL_SX = {
  minWidth: 112,
  px: 2.25,
  py: 0.95,
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  boxShadow: "none",
  "&:hover": { boxShadow: "none" },
} as const;

export const GHOST_PILL_SX = {
  ...PRIMARY_PILL_SX,
  minWidth: 0,
  px: 1.5,
  border: "1px solid",
  borderColor: "rgba(232, 216, 199, 0.22)",
  color: "rgba(232, 216, 199, 0.82)",
  bgcolor: "transparent",
  "&:hover": {
    boxShadow: "none",
    borderColor: "rgba(232, 216, 199, 0.4)",
    bgcolor: "rgba(91, 44, 111, 0.18)",
  },
} as const;
