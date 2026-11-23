import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export type StudyFreshEmptyProps = {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  actionBusy?: boolean;
  /** Contained primary (default) or outlined ivory on stage. */
  actionVariant?: "contained" | "outlined";
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

export default function StudyFreshEmpty(props: StudyFreshEmptyProps) {
  const variant = props.actionVariant ?? "contained";

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
