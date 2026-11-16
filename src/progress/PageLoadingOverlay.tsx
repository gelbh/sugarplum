import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import type { ProgressSnapshot } from "./types";
import { SHELL_FG, SHELL_MUTED } from "../components/shell/chromeTokens";

type Props = {
  snapshot: ProgressSnapshot | null;
};

/** Soft veil over shell main while a route load op is active. */
export default function PageLoadingOverlay({ snapshot }: Props) {
  if (!snapshot) return null;

  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label={snapshot.label}
      sx={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        bgcolor: "rgba(15, 5, 14, 0.72)",
        backdropFilter: "blur(6px)",
        animation: "pageLoadIn 180ms ease both",
        "@keyframes pageLoadIn": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        "@media (prefers-reduced-motion: reduce)": {
          animation: "none",
          backdropFilter: "none",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.75,
          px: 3,
          py: 2.5,
          borderRadius: 2,
          border: "1px solid rgba(232, 216, 199, 0.12)",
          bgcolor: "rgba(30, 13, 27, 0.88)",
          boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
          maxWidth: 280,
          textAlign: "center",
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: "relative",
            width: 52,
            height: 52,
            display: "grid",
            placeItems: "center",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: -6,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(91, 44, 111, 0.55) 0%, transparent 70%)",
            }}
          />
          <CircularProgress
            size={36}
            thickness={3.2}
            sx={{ color: "primary.light" }}
          />
        </Box>
        <Box
          component="img"
          src="/logo-sidebar.png"
          alt=""
          sx={{ height: 22, width: "auto", opacity: 0.9 }}
        />
        <Typography
          variant="body2"
          sx={{ color: SHELL_FG, fontWeight: 500, letterSpacing: "0.02em" }}
        >
          {snapshot.label.replace(/\u2026$/, "").replace(/\.\.\.$/, "") ||
            "Loading"}
        </Typography>
        <Typography variant="caption" sx={{ color: SHELL_MUTED }}>
          One moment
        </Typography>
      </Box>
    </Box>
  );
}
