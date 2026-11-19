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

/** Dark-scheme MUI disabled colors are ivory, the same as the card face. */
export const FACE_DISABLED_SX = {
  "&& .Mui-disabled": { color: "inherit", WebkitTextFillColor: "currentColor" },
  "&& .MuiButtonBase-root.Mui-disabled": { opacity: 0.4, borderColor: "currentColor" },
  "&& .MuiInputBase-root.Mui-disabled": { opacity: 0.6 },
} as const;

export const CARD_COLUMN_SX = {
  width: "100%",
  maxWidth: 360,
  mx: "auto",
} as const;

export const FACE_BODY_SX = {
  overflowX: "hidden",
  overflowY: "auto",
  overscrollBehavior: "contain",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  width: "100%",
  // Never show a focus ring on the scrollport (Study focuses the answer text instead).
  outline: "none",
  boxShadow: "none",
  WebkitTapHighlightColor: "transparent",
  "&:focus": { outline: "none" },
  "&:focus-visible": { outline: "none" },
} as const;

export const PROMPT_SX = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  minHeight: 0,
} as const;

export const FACE_PROMPT_TEXT_SX = {
  fontFamily: FACE_SANS,
  fontSize: { xs: "1.125rem", sm: "1.35rem" },
  fontWeight: 400,
  lineHeight: 1.35,
  whiteSpace: "pre-wrap",
  color: "inherit",
} as const;

export const FACE_ANSWER_TEXT_SX = {
  fontFamily: FACE_SANS,
  fontSize: { xs: "1.05rem", sm: "1.2rem" },
  fontWeight: 400,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  color: "inherit",
} as const;

export const FACE_FRONT_ECHO_SX = {
  fontFamily: FACE_SANS,
  fontSize: "0.8125rem",
  fontWeight: 500,
  lineHeight: 1.35,
  whiteSpace: "pre-wrap",
  color: "inherit",
  opacity: 0.55,
  textAlign: "center",
  mb: 1.5,
  flexShrink: 0,
} as const;

export const FACE_HINT_TEXT_SX = {
  fontFamily: FACE_SANS,
  fontSize: "0.8125rem",
  fontWeight: 400,
  lineHeight: 1.4,
  whiteSpace: "pre-wrap",
  color: "inherit",
  opacity: 0.6,
  mt: 1.5,
} as const;

export const FACE_MEDIA_SX = {
  display: "block",
  width: "100%",
  maxHeight: "36%",
  objectFit: "contain",
  mb: 2,
  borderRadius: 1,
  userSelect: "none",
} as const;

export const FACE_OUTLINE_BUTTON_SX = {
  fontFamily: FACE_SANS,
  minHeight: 44,
  borderColor: "currentColor",
  color: "inherit",
  opacity: 0.85,
  "&:hover": {
    borderColor: "currentColor",
    bgcolor: "rgba(30, 13, 27, 0.06)",
  },
} as const;

export function faceMotionSx(
  revealedFace: boolean,
  thisFaceVisible: boolean,
  dense = false,
) {
  return {
    ...FACE_SX,
    height: "100%",
    backfaceVisibility: "hidden" as const,
    WebkitBackfaceVisibility: "hidden" as const,
    position: "absolute" as const,
    inset: 0,
    ...(revealedFace ? { transform: "rotateY(180deg)" } : {}),
    "@media (prefers-reduced-motion: reduce)": dense
      ? {
          transform: "none",
          transition: "none",
          opacity: thisFaceVisible ? 1 : 0,
          visibility: thisFaceVisible ? "visible" : "hidden",
          pointerEvents: thisFaceVisible ? "auto" : "none",
          position: "absolute" as const,
          inset: 0,
          width: "100%",
          height: "100%",
          minHeight: 0,
        }
      : {
          transform: "none",
          transition: "none",
          opacity: thisFaceVisible ? 1 : 0,
          visibility: thisFaceVisible ? "visible" : "hidden",
          pointerEvents: thisFaceVisible ? "auto" : "none",
          position: thisFaceVisible ? "relative" : "absolute",
          inset: thisFaceVisible ? "auto" : 0,
          width: "100%",
          height: thisFaceVisible ? "auto" : undefined,
          minHeight: thisFaceVisible ? 280 : undefined,
        },
  };
}
