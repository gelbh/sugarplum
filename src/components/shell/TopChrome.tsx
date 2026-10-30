import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { navigate, shellBackHref } from "../../nav/navigate";
import {
  SHELL_BG,
  SHELL_FG,
  SHELL_HAIRLINE,
  TOP_BAR_HEIGHT,
} from "./chromeTokens";

const BACK_SLOT = 40;

type TopChromeProps = {
  trailing?: ReactNode;
};

/** Mobile top bar content: Back for nested routes, centered logo + Alice wordmark. */
export default function TopChrome({ trailing }: TopChromeProps) {
  const backHref = shellBackHref(window.location.pathname);

  return (
    <Box
      component="header"
      sx={{
        bgcolor: SHELL_BG,
        color: SHELL_FG,
        pt: "env(safe-area-inset-top)",
        borderBottom: `1px solid ${SHELL_HAIRLINE}`,
      }}
    >
      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          minHeight: TOP_BAR_HEIGHT,
          px: 0.5,
        }}
      >
        <Box
          sx={{
            width: BACK_SLOT,
            height: BACK_SLOT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {backHref ? (
            <IconButton
              aria-label="Back"
              onClick={() => navigate(backHref)}
              size="small"
              sx={{ color: SHELL_FG }}
            >
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          ) : null}
        </Box>
        <Box
          sx={{
            ml: "auto",
            minWidth: BACK_SLOT,
            minHeight: BACK_SLOT,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flexShrink: 0,
            px: 0.5,
          }}
        >
          {trailing}
        </Box>
        <Box
          sx={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            alignItems: "center",
            gap: 1,
            pointerEvents: "none",
          }}
        >
          <Box
            component="img"
            src="/logo.png"
            alt=""
            sx={{
              height: 28,
              width: "auto",
              display: "block",
            }}
          />
          <Typography
            variant="h6"
            noWrap
            sx={{
              color: SHELL_FG,
              letterSpacing: 0.2,
              // Below 360px the wordmark collides with the trailing Streak chip.
              "@media (max-width: 359.95px)": { display: "none" },
            }}
          >
            Sugarplum
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
