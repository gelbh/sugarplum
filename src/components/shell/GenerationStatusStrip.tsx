import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import type { ShellGenerationStatus } from "../../shell/resolveShellGenerationStatus";
import { navigate } from "../../nav/navigate";
import {
  SHELL_FG,
  SHELL_HAIRLINE,
  SHELL_MUTED,
  SHELL_SELECTED,
} from "./chromeTokens";

type GenerationStatusStripProps = {
  status: ShellGenerationStatus;
  dense?: boolean;
};

const DOT: Record<ShellGenerationStatus["kind"], string> = {
  generating: SHELL_SELECTED,
  drafts_ready: "#A5D6A7",
  failed: "#E57373",
};

export default function GenerationStatusStrip({
  status,
  dense = false,
}: GenerationStatusStripProps) {
  const showBar =
    status.kind === "generating" &&
    status.percent != null &&
    Number.isFinite(status.percent);

  return (
    <ButtonBase
      component="button"
      type="button"
      onClick={() => navigate(status.href)}
      aria-label={status.ariaLabel}
      sx={{
        display: "block",
        width: "100%",
        textAlign: "left",
        color: SHELL_FG,
        borderRadius: dense ? 0 : 1,
        border: dense ? "none" : `1px solid ${SHELL_HAIRLINE}`,
        borderTop: dense ? `1px solid ${SHELL_HAIRLINE}` : undefined,
        bgcolor:
          status.kind === "drafts_ready"
            ? "rgba(91, 44, 111, 0.28)"
            : dense
              ? "rgba(245, 245, 245, 0.06)"
              : "rgba(245, 245, 245, 0.04)",
        px: dense ? 2 : 1.75,
        py: dense ? 1.25 : 1.5,
        "&:hover": {
          bgcolor: "rgba(91, 44, 111, 0.22)",
        },
      }}
    >
      {!dense ? (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: SHELL_MUTED,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: "0.75rem",
            mb: 0.5,
          }}
        >
          Generation
        </Typography>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: DOT[status.kind],
            flexShrink: 0,
            ...(status.kind === "generating"
              ? {
                  animation: "sp-gen-pulse 1.4s ease-in-out infinite",
                  "@keyframes sp-gen-pulse": {
                    "0%, 100%": { opacity: 1, transform: "scale(1)" },
                    "50%": { opacity: 0.45, transform: "scale(0.85)" },
                  },
                }
              : {}),
          }}
        />
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            fontSize: "0.9375rem",
            color: status.kind === "failed" ? "#E57373" : SHELL_FG,
            lineHeight: 1.3,
          }}
        >
          {status.label}
        </Typography>
      </Box>
      {status.subline ? (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: SHELL_MUTED,
            fontSize: "0.8125rem",
            mt: 0.5,
            pl: dense ? "16px" : 0,
            lineHeight: 1.35,
          }}
        >
          {status.subline}
        </Typography>
      ) : null}
      {showBar ? (
        <LinearProgress
          variant="determinate"
          value={status.percent ?? 0}
          aria-hidden
          sx={{
            mt: 1,
            ml: dense ? "16px" : 0,
            height: 3,
            borderRadius: 1,
            bgcolor: "rgba(245, 245, 245, 0.12)",
            "& .MuiLinearProgress-bar": {
              bgcolor: SHELL_SELECTED,
            },
          }}
        />
      ) : null}
    </ButtonBase>
  );
}
