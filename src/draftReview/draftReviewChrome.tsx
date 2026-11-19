export const PRIMARY_PILL_SX = {
  minWidth: 140,
  px: 2.5,
  py: 1.1,
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  boxShadow: "none",
  "&:hover": { boxShadow: "none" },
} as const;

export const BATCH_PILL_BASE = {
  minHeight: 40,
  px: 1.6,
  py: 0.85,
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  fontSize: "0.8125rem",
  letterSpacing: "0.02em",
  boxShadow: "none",
  border: "1px solid",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  "& .MuiButton-startIcon": { mr: 0.65 },
  "&:hover": { boxShadow: "none" },
  "&.Mui-disabled": {
    opacity: 0.42,
    borderColor: "rgba(232, 216, 199, 0.16)",
    color: "rgba(232, 216, 199, 0.42)",
  },
} as const;

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
