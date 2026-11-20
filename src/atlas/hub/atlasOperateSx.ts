import type { SxProps, Theme } from "@mui/material/styles";

/** Selected-stage title: Alice as the one display moment on the board. */
export const atlasStageTitleSx: SxProps<Theme> = {
  fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
  color: "text.primary",
  fontWeight: 400,
  letterSpacing: "0.02em",
  fontSize: { xs: "1.2rem", sm: "1.35rem" },
  lineHeight: 1.2,
};

/** Shared mobile bottom temporary Drawer paper (Cabinet filters + Entry rail). */
export const atlasBottomSheetPaperSx: SxProps<Theme> = {
  maxHeight: "min(70dvh, 560px)",
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  p: 2,
  pb: "max(1rem, env(safe-area-inset-bottom))",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
