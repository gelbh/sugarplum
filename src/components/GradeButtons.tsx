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
import KeyChip from "./KeyChip";
import { CARD_COLUMN_SX, FACE_SANS } from "./studyFaceSx";

/** Icons mirror swipe directions (← Again · ↓ Hard · → Good · ↑ Easy). */
const GRADES: {
  rating: StudyRating;
  label: string;
  key: string;
  arrowKey: string;
  arrowName: string;
  Icon: SvgIconComponent;
}[] = [
  {
    rating: 1,
    label: "Again",
    key: "1",
    arrowKey: "ArrowLeft",
    arrowName: "left arrow",
    Icon: ArrowBackRoundedIcon,
  },
  {
    rating: 2,
    label: "Hard",
    key: "2",
    arrowKey: "ArrowDown",
    arrowName: "down arrow",
    Icon: ArrowDownwardRoundedIcon,
  },
  {
    rating: 3,
    label: "Good",
    key: "3",
    arrowKey: "ArrowRight",
    arrowName: "right arrow",
    Icon: ArrowForwardRoundedIcon,
  },
  {
    rating: 4,
    label: "Easy",
    key: "4",
    arrowKey: "ArrowUp",
    arrowName: "up arrow",
    Icon: ArrowUpwardRoundedIcon,
  },
];

type Props = {
  disabled?: boolean;
  onGrade: (rating: StudyRating) => void;
  showSwipeHint?: boolean;
};

export default function GradeButtons({
  disabled,
  onGrade,
  showSwipeHint = false,
}: Props) {
  return (
    <Stack spacing={1.25} sx={CARD_COLUMN_SX}>
      {showSwipeHint ? (
        <Typography
          variant="caption"
          sx={{
            textAlign: "center",
            fontFamily: FACE_SANS,
            letterSpacing: "0.04em",
            color: "inherit",
            opacity: 0.72,
          }}
        >
          <Box component="span" sx={{ display: { xs: "inline", md: "none" } }}>
            Swipe: ← Again · → Good · ↓ Hard · ↑ Easy
          </Box>
          <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
            Keys 1-4 or arrows · Space flips
          </Box>
        </Typography>
      ) : null}
      <Stack
        direction="row"
        spacing={0.75}
        useFlexGap
        sx={{ width: "100%", justifyContent: "space-between" }}
      >
        {GRADES.map((g) => {
          const { Icon } = g;
          const colors = gradeColorVars(g.rating);
          return (
            <Button
              key={g.rating}
              fullWidth
              disableElevation
              disabled={disabled}
              onClick={() => onGrade(g.rating)}
              aria-keyshortcuts={`${g.key} ${g.arrowKey}`}
              aria-label={`${g.label} (key ${g.key} or ${g.arrowName})`}
              sx={{
                flex: 1,
                minHeight: 56,
                minWidth: 0,
                px: 0.5,
                py: 1,
                borderRadius: 1,
                color: colors.fg,
                bgcolor: colors.wash,
                border: "1px solid",
                borderColor: colors.border,
                opacity: 0.95,
                transition:
                  "background-color 0.18s ease, opacity 0.18s ease, transform 0.12s ease",
                "&:hover": {
                  bgcolor: colors.wash,
                  filter: "brightness(1.12)",
                  opacity: 1,
                },
                "&:active": {
                  transform: "scale(0.97)",
                },
                "&.Mui-disabled": {
                  opacity: 0.35,
                  borderColor: colors.border,
                  color: colors.fg,
                },
                "&:focus-visible": {
                  outline: "2px solid",
                  outlineColor: colors.border,
                  outlineOffset: 2,
                },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.5,
                  width: "100%",
                }}
              >
                <Icon aria-hidden sx={{ fontSize: "1.35rem", opacity: 0.95 }} />
                <Typography
                  component="span"
                  sx={{
                    fontFamily: FACE_SANS,
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                    lineHeight: 1.2,
                    textTransform: "none",
                  }}
                >
                  {g.label}
                </Typography>
                <KeyChip
                  label={g.key}
                  color={colors.fg}
                  borderColor={colors.border}
                />
              </Box>
            </Button>
          );
        })}
      </Stack>
    </Stack>
  );
}
