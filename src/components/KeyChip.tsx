import Box from "@mui/material/Box";
import { FACE_SANS } from "./studyFaceSx";

type Props = {
  label: string;
  borderColor?: string;
  ml?: number;
};

/** Desktop-only key hint; hidden below md where touch and swipe lead. */
export default function KeyChip({
  label,
  borderColor = "currentColor",
  ml,
}: Props) {
  return (
    <Box
      aria-hidden
      component="span"
      sx={{
        display: { xs: "none", md: "inline-flex" },
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        minWidth: "18px",
        height: "16px",
        px: "4px",
        ml,
        borderRadius: "3px",
        border: "1px solid",
        borderColor,
        color: "inherit",
        fontFamily: FACE_SANS,
        fontSize: "0.625rem",
        fontWeight: 500,
        letterSpacing: "0.04em",
        lineHeight: 1,
        opacity: 0.65,
      }}
    >
      {label}
    </Box>
  );
}
