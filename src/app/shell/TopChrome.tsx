import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { goShellBack } from "../../shared/nav/navigate";
import {
  useResolvedShellBack,
  useShellBackOverride,
} from "./ShellBackOverride";
import {
  SHELL_BG,
  SHELL_FG,
  SHELL_HAIRLINE,
  TOP_BAR_HEIGHT,
} from "./chromeTokens";

const BACK_SLOT = 40;

/** Mobile top bar: Back for nested routes, centered logo + Alice wordmark. */
export default function TopChrome() {
  const backHref = useResolvedShellBack(window.location.pathname);
  const { handler: backHandler } = useShellBackOverride();
  const showBack = backHandler != null || backHref != null;

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
          {showBack ? (
            <IconButton
              aria-label="Back"
              onClick={() => {
                if (backHandler) backHandler();
                else if (backHref) goShellBack(backHref);
              }}
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
            }}
          >
            Sugarplum
          </Typography>
        </Box>
        <Box
          aria-hidden
          sx={{
            justifySelf: "end",
            width: BACK_SLOT,
            height: BACK_SLOT,
          }}
        />
      </Box>
    </Box>
  );
}
