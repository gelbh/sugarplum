/** Shared playing-card face tokens for CardFace / McqFace (DESIGN.md dual-register). */

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

/** Ivory face paper chrome: padding, drop shadow, stage ink on card stock.
 * Flip-only height/backface live in CardFace `faceMotionSx`, not here. */
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

/** Card column cap matching DESIGN.md spacing.card-max. */
export const CARD_COLUMN_SX = {
  width: "100%",
  maxWidth: 360,
  mx: "auto",
} as const;
