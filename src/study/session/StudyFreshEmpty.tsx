import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { formatLearningEta } from "../queue/useLearningRequeue";

export type StudyFreshEmptyProps = {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  actionBusy?: boolean;
  actionVariant?: "contained" | "outlined";
  /** Soonest future due; when set, show a live countdown. */
  nextDueAt?: string | null;
};

const enterSx = {
  "@keyframes studyFreshIn": {
    from: { opacity: 0, transform: "translateY(8px)" },
    to: { opacity: 1, transform: "translateY(0)" },
  },
  "@media (prefers-reduced-motion: reduce)": {
    "@keyframes studyFreshIn": {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
  },
  animation: "studyFreshIn 400ms cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

const alice = '"Alice", "Georgia", "Times New Roman", serif';
const amber = "var(--sp-grade-hard-border, #c4a574)";
const amberLit = "var(--sp-grade-hard-fg, #e8d0a8)";

export default function StudyFreshEmpty(props: StudyFreshEmptyProps) {
  const variant = props.actionVariant ?? "contained";
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!props.nextDueAt) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [props.nextDueAt]);
  const eta = props.nextDueAt ? formatLearningEta(props.nextDueAt) : null;

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        maxWidth: 360,
        py: { xs: 2, sm: 3 },
        ...enterSx,
      }}
    >
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
      <Stack
        spacing={0}
        sx={{
          position: "relative",
          zIndex: 1,
          alignItems: "center",
          textAlign: "center",
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
            color: "var(--sp-ivory)",
            m: 0,
          }}
        >
          {props.title}
        </Typography>
        <Box
          aria-hidden
          sx={{
            width: 40,
            height: "1px",
            bgcolor: amber,
            mt: 1.25,
            mb: 2,
            flexShrink: 0,
            boxShadow: `0 0 12px color-mix(in srgb, ${amber} 55%, transparent)`,
          }}
        />
        {eta ? (
          <Typography
            sx={{
              fontFamily: alice,
              fontSize: { xs: "1.65rem", sm: "1.85rem" },
              lineHeight: 1.2,
              color: "var(--sp-ivory)",
              m: 0,
              mb: 1.5,
            }}
          >
            Next cards in{" "}
            <Box
              component="span"
              sx={{
                color: amberLit,
                textShadow: `0 0 24px color-mix(in srgb, ${amber} 45%, transparent)`,
              }}
            >
              {eta}
            </Box>
          </Typography>
        ) : null}
        <Typography
          variant="body2"
          sx={{
            color: "color-mix(in srgb, var(--sp-ivory) 72%, transparent)",
            maxWidth: "18rem",
            lineHeight: 1.45,
          }}
        >
          {props.body}
        </Typography>
        <Button
          variant={variant}
          size="large"
          disabled={props.actionBusy}
          onClick={props.onAction}
          sx={{
            mt: 2.75,
            width: "100%",
            maxWidth: 260,
            py: 1.5,
            fontWeight: variant === "contained" ? 700 : 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontSize: "0.8rem",
            borderRadius: "10px",
            ...(variant === "outlined"
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
          {props.actionLabel}
        </Button>
      </Stack>
    </Box>
  );
}
