import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import { navigate, shellBackHref } from "../../nav/navigate";
import {
  SHELL_BG,
  SHELL_FG,
  SHELL_HAIRLINE,
  TOP_BAR_HEIGHT,
} from "./chromeTokens";

const BACK_SLOT = 40;

/** Fixed mobile top bar: Back only for nested routes, centered logo mark. */
export default function TopChrome() {
  const backHref = shellBackHref(window.location.pathname);

  return (
    <Box
      component="header"
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
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
          component="img"
          src="/logo.png"
          alt="Sugarplum"
          sx={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            height: 28,
            width: "auto",
            display: "block",
            pointerEvents: "none",
          }}
        />
      </Box>
    </Box>
  );
}
