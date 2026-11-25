export const TOOL_LINK = {
  minWidth: 0,
  px: 1,
  py: 0.35,
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  fontSize: "0.75rem",
  letterSpacing: "0.04em",
  color: "rgba(232, 216, 199, 0.62)",
  "&:hover": {
    color: "primary.light",
    bgcolor: "rgba(91, 44, 111, 0.22)",
  },
} as const;

export const SELECT_CHECKBOX_SX = {
  p: 0.55,
  borderRadius: "9px",
  color: "rgba(232, 216, 199, 0.42)",
  bgcolor: "rgba(18, 7, 15, 0.42)",
  border: "1px solid rgba(232, 216, 199, 0.22)",
  transition:
    "background-color 140ms ease, border-color 140ms ease, color 140ms ease",
  "& .MuiSvgIcon-root": {
    fontSize: 17,
  },
  "&:hover": {
    bgcolor: "rgba(91, 44, 111, 0.32)",
    borderColor: "rgba(232, 216, 199, 0.4)",
    color: "rgba(232, 216, 199, 0.72)",
  },
  "&.Mui-checked, &.MuiCheckbox-indeterminate": {
    color: "rgba(245, 235, 220, 0.95)",
    bgcolor: "rgba(91, 44, 111, 0.52)",
    borderColor: "rgba(209, 163, 226, 0.55)",
  },
  "&.Mui-disabled": {
    opacity: 0.45,
  },
} as const;
