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
          display: "grid",
          // Equal side tracks centre the brand; a wide chip grows its track and
          // nudges the brand left instead of overlapping it.
          gridTemplateColumns:
            "minmax(max-content, 1fr) auto minmax(max-content, 1fr)",
          columnGap: 1,
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
              // Below 340px the brand and a long Streak chip cannot share the row.
              "@media (max-width: 339.95px)": { display: "none" },
            }}
          >
            Sugarplum
          </Typography>
        </Box>
        <Box
          sx={{
            justifySelf: "end",
            minWidth: BACK_SLOT,
            minHeight: BACK_SLOT,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            px: 0.5,
          }}
        >
          {trailing}
        </Box>
      </Box>
    </Box>
  );
}
