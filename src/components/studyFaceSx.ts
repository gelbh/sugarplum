export const FACE_SANS = '"Source Sans 3", "Helvetica", "Arial", sans-serif';

export const OVERLINE_SX = {
  fontFamily: FACE_SANS,
  fontSize: "0.6875rem",
  fontWeight: 500,
  letterSpacing: "0.22em",
  textTransform: "uppercase" as const,
  color: "inherit",
  opacity: 0.55,
  textAlign: "center" as const,
  lineHeight: 1.2,
};

export const FACE_SX = {
  p: 3,
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  borderRadius: 2,
  boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35)",
  bgcolor: "var(--sp-card-face)",
  color: "var(--sp-stage-bg)",
  fontFamily: FACE_SANS,
} as const;

export const CARD_COLUMN_SX = {
  width: "100%",
  maxWidth: 360,
  mx: "auto",
} as const;
