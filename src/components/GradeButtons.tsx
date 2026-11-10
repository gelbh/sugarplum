import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SvgIconComponent } from "@mui/icons-material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import type { StudyRating } from "../api/client";
import { gradeColorVars } from "../study/gradeColors";
import { GRADE_LABELS, gradeLabelMultiline } from "../study/gradeLabels";
import { GRADE_BINDINGS } from "../study/studyKeys";
import { CARD_COLUMN_SX, FACE_SANS } from "./studyFaceSx";

const GRADE_ICONS: Record<StudyRating, SvgIconComponent> = {
  1: ArrowBackRoundedIcon,
  2: ArrowDownwardRoundedIcon,
  3: ArrowForwardRoundedIcon,
  4: ArrowUpwardRoundedIcon,
};

const KEY_TAB = 18;

type Props = {
  disabled?: boolean;
  onGrade: (rating: StudyRating) => void;
};

export default function GradeButtons({ disabled, onGrade }: Props) {
  return (
    <Stack
      direction="row"
      spacing={0.75}
      useFlexGap
      sx={{
        ...CARD_COLUMN_SX,
        justifyContent: "space-between",
        pb: `${KEY_TAB / 2}px`,
      }}
    >
      {GRADE_BINDINGS.map((g) => {
        const label = GRADE_LABELS[g.rating];
        const Icon = GRADE_ICONS[g.rating];
        const colors = gradeColorVars(g.rating);
        return (
          <Box
            key={g.rating}
            sx={{
              flex: 1,
              minWidth: 0,
              position: "relative",
              opacity: disabled ? 0.35 : 0.95,
              transition:
                "filter 0.18s ease, opacity 0.18s ease, transform 0.12s ease",
              // Tile + hanging tab share hover/press/focus so the junction stays glued.
              "&:has(button:hover)": {
                filter: "brightness(1.12)",
                opacity: disabled ? 0.35 : 1,
              },
              "&:has(button:active)": {
                transform: "scale(0.97)",
              },
              "&:has(button:focus-visible)": {
                outline: "2px solid",
                outlineColor: colors.border,
                outlineOffset: 2,
                borderRadius: 1,
              },
            }}
          >
            <Box
              data-grade-mailbox={g.rating}
              sx={{
                aspectRatio: "1",
                position: "relative",
                borderRadius: 1,
                border: "1px solid",
                borderColor: colors.border,
                borderBottom: "none",
                bgcolor: colors.wash,
              }}
            >
              {/* Bottom border as two stubs with a gap for the key tab. */}
              <Box
                aria-hidden
                sx={{
                  position: "absolute",
                  left: 0,
                  right: `calc(50% + ${KEY_TAB / 2}px)`,
                  bottom: 0,
                  height: "1px",
                  bgcolor: colors.border,
                }}
              />
              <Box
                aria-hidden
                sx={{
                  position: "absolute",
                  left: `calc(50% + ${KEY_TAB / 2}px)`,
                  right: 0,
                  bottom: 0,
                  height: "1px",
                  bgcolor: colors.border,
                }}
              />
              <Button
                fullWidth
                disableElevation
                disabled={disabled}
                onClick={() => onGrade(g.rating)}
                aria-keyshortcuts={`${g.digit} ${g.arrow}`}
                aria-label={`${label} (key ${g.digit} or ${g.arrowName})`}
                sx={{
                  height: "100%",
                  minWidth: 0,
                  minHeight: 0,
                  px: 0.25,
                  py: 0.5,
                  borderRadius: 1,
                  color: colors.fg,
                  bgcolor: "transparent",
                  border: "none",
                  boxShadow: "none",
                  "&:hover": {
                    bgcolor: "transparent",
                    boxShadow: "none",
                  },
                  "&.Mui-disabled": {
                    color: colors.fg,
                  },
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.35,
                    width: "100%",
                    pb: `${KEY_TAB / 2 + 2}px`,
                  }}
                >
                  <Icon
                    aria-hidden
                    sx={{ fontSize: "1.25rem", opacity: 0.95 }}
                  />
                  <Typography
                    component="span"
                    sx={{
                      fontFamily: FACE_SANS,
                      fontSize: "0.6875rem",
                      fontWeight: 500,
                      letterSpacing: "0.01em",
                      lineHeight: 1.15,
                      textAlign: "center",
                      textTransform: "none",
                      whiteSpace: "pre-line",
                    }}
                  >
                    {gradeLabelMultiline(g.rating)}
                  </Typography>
                </Box>
              </Button>
            </Box>
            <Box
              aria-hidden
              sx={{
                position: "absolute",
                left: "50%",
                bottom: 0,
                transform: "translate(-50%, 50%)",
                width: KEY_TAB,
                height: KEY_TAB,
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "0 0 3px 3px",
                border: "1px solid",
                borderTop: "none",
                borderColor: colors.border,
                bgcolor: "var(--sp-stage-bg, #1e0d1b)",
                backgroundImage: `linear-gradient(${colors.wash}, ${colors.wash})`,
                color: colors.fg,
                fontFamily: FACE_SANS,
                fontSize: "0.625rem",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
                letterSpacing: "0.04em",
                pointerEvents: "none",
              }}
            >
              {g.digit}
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
