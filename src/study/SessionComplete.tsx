import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import FruitMedal from "../achievements/FruitMedal";
import type { UnlockView } from "../achievements/wire";
import { gradeLabelMultiline } from "./gradeLabels";
import { gradedTotal, type GradeTally } from "./sessionTally";

const GRADES = [
  { key: "again", rating: 1 as const },
  { key: "hard", rating: 2 as const },
  { key: "good", rating: 3 as const },
  { key: "easy", rating: 4 as const },
] as const;

export type SessionCompleteProps = {
  zen: boolean;
  tally: GradeTally;
  unlocks: readonly UnlockView[];
  showAchievements: boolean;
  canStudyMore: boolean;
  studyMoreBusy: boolean;
  onStudyMore: () => void;
  onToday: () => void;
  onAchievements: () => void;
  scopeBack: { href: string; label: string; onClick: () => void } | null;
};

const alice = '"Alice", "Georgia", "Times New Roman", serif';
const amber = "var(--sp-grade-hard-border, #c4a574)";

const enterSx = {
  "@keyframes sessionCompleteIn": {
    from: { opacity: 0, transform: "translateY(8px)" },
    to: { opacity: 1, transform: "translateY(0)" },
  },
  "@media (prefers-reduced-motion: reduce)": {
    "@keyframes sessionCompleteIn": {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
  },
  animation: "sessionCompleteIn 400ms cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

const ctaSx = {
  py: 1.5,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  fontSize: "0.8rem",
  borderRadius: "10px",
} as const;

export default function SessionComplete(props: SessionCompleteProps) {
  const reviewed = gradedTotal(props.tally);
  const ink = props.zen ? "var(--sp-ivory)" : "text.primary";
  const muted = props.zen
    ? "color-mix(in srgb, var(--sp-ivory) 72%, transparent)"
    : "text.secondary";

  const body = (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        maxWidth: props.zen ? 420 : undefined,
        mx: props.zen ? "auto" : undefined,
        py: props.zen ? { xs: 2, sm: 3 } : undefined,
        ...enterSx,
      }}
    >
      {props.zen ? (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: "-18% -12% -8%",
            backgroundImage:
              "radial-gradient(ellipse 70% 58% at 50% 42%, rgba(196, 165, 116, 0.42) 0%, transparent 72%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      ) : null}
      <Stack
        spacing={0}
        sx={{
          position: "relative",
          zIndex: 1,
          alignItems: props.zen ? "center" : "stretch",
          textAlign: props.zen ? "center" : "left",
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontFamily: alice,
            fontWeight: 400,
            fontSize: { xs: "1.45rem", sm: "1.6rem" },
            letterSpacing: "0.02em",
            color: props.zen ? "var(--sp-ivory)" : ink,
            m: 0,
          }}
        >
          Caught up for now
        </Typography>
        <Box
          aria-hidden
          sx={{
            width: 40,
            height: "1px",
            bgcolor: amber,
            mt: 1.25,
            mb: 1.75,
            flexShrink: 0,
            alignSelf: props.zen ? "center" : "flex-start",
            boxShadow: props.zen
              ? `0 0 12px color-mix(in srgb, ${amber} 55%, transparent)`
              : undefined,
          }}
        />
        <Typography
          variant="body2"
          sx={{
            color: muted,
            m: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {reviewed} reviewed
        </Typography>
        <Box
          sx={{
            mt: 2,
            width: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
          }}
        >
          {GRADES.map((grade) => (
            <Box
              key={grade.key}
              sx={{
                textAlign: "center",
                py: 1.1,
                px: 0.5,
                borderRadius: "8px",
                bgcolor: `var(--sp-grade-${grade.key}-wash)`,
                border: "1px solid",
                borderColor: `var(--sp-grade-${grade.key}-border)`,
              }}
            >
              <Typography
                sx={{
                  fontFamily: alice,
                  fontSize: "1.35rem",
                  lineHeight: 1.1,
                  fontVariantNumeric: "tabular-nums",
                  color: ink,
                }}
              >
                {props.tally[grade.key]}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  mt: 0.35,
                  color: `var(--sp-grade-${grade.key}-fg, var(--sp-grade-${grade.key}-border))`,
                  display: "block",
                  whiteSpace: "pre-line",
                  lineHeight: 1.2,
                  opacity: 0.95,
                }}
              >
                {gradeLabelMultiline(grade.rating)}
              </Typography>
            </Box>
          ))}
        </Box>
        {props.showAchievements && props.unlocks.length > 0 ? (
          <Box sx={{ mt: 2.5, width: "100%" }}>
            <Typography
              variant="caption"
              sx={{
                color: muted,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                display: "block",
              }}
            >
              New medals
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                mt: 1,
                flexWrap: "wrap",
                justifyContent: props.zen ? "center" : "flex-start",
              }}
            >
              {props.unlocks.map((unlock) => (
                <FruitMedal
                  key={unlock.id}
                  fruitType={unlock.fruitType}
                  traits={unlock.traits}
                  size={56}
                  sheenOnce
                />
              ))}
            </Stack>
          </Box>
        ) : null}
        <Stack
          spacing={1.25}
          sx={{ mt: 2.75, width: "100%", maxWidth: props.zen ? 260 : undefined }}
        >
          {props.canStudyMore ? (
            <Button
              variant="contained"
              size="large"
              disabled={props.studyMoreBusy}
              onClick={props.onStudyMore}
              sx={ctaSx}
            >
              {props.studyMoreBusy ? "Loading…" : "Study more"}
            </Button>
          ) : null}
          <Button
            variant={props.canStudyMore ? "outlined" : "contained"}
            size="large"
            onClick={props.onToday}
            sx={{
              ...ctaSx,
              fontWeight: props.canStudyMore ? 600 : 700,
              ...(props.zen && props.canStudyMore
                ? {
                    color: "var(--sp-ivory)",
                    borderWidth: 1.5,
                    borderColor:
                      "color-mix(in srgb, var(--sp-ivory) 55%, transparent)",
                    "&:hover": {
                      borderWidth: 1.5,
                      borderColor: "var(--sp-ivory)",
                      bgcolor:
                        "color-mix(in srgb, var(--sp-ivory) 8%, transparent)",
                    },
                  }
                : {}),
            }}
          >
            Today
          </Button>
          {props.showAchievements ? (
            <Link
              href="/orchard"
              underline="hover"
              onClick={(ev) => {
                ev.preventDefault();
                props.onAchievements();
              }}
              sx={{
                color: muted,
                fontSize: "0.875rem",
                alignSelf: props.zen ? "center" : "flex-start",
              }}
            >
              Orchard
            </Link>
          ) : null}
          {props.scopeBack ? (
            <Link
              href={props.scopeBack.href}
              underline="hover"
              onClick={(ev) => {
                ev.preventDefault();
                props.scopeBack?.onClick();
              }}
              sx={{
                color: muted,
                fontSize: "0.875rem",
                alignSelf: props.zen ? "center" : "flex-start",
              }}
            >
              {props.scopeBack.label}
            </Link>
          ) : null}
        </Stack>
      </Stack>
    </Box>
  );

  if (!props.zen) {
    return (
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        {body}
      </Paper>
    );
  }
  return body;
}
