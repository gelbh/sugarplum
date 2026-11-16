import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { navigateReplace } from "../../nav/navigate";
import type { ShellGenerationStatus } from "../../shell/resolveShellGenerationStatus";
import GenerationStatusStrip from "./GenerationStatusStrip";
import {
  SHELL_BG,
  SHELL_FG,
  SHELL_HAIRLINE,
  SHELL_MUTED,
  SHELL_SELECTED,
  TOP_BAND_HEIGHT,
} from "./chromeTokens";
import type { ShellNavId, ShellNavItem } from "./shellNav";

type Props = {
  drawerNav: ShellNavItem[];
  active: ShellNavId;
  genStatus: ShellGenerationStatus | null;
  streakChip: ReactNode;
};

export default function TopPictogramBand({
  drawerNav,
  active,
  genStatus,
  streakChip,
}: Props) {
  return (
    <Box
      component="header"
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        bgcolor: SHELL_BG,
        color: SHELL_FG,
        borderBottom: `1px solid ${SHELL_HAIRLINE}`,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          minHeight: TOP_BAND_HEIGHT,
          px: { sm: 1.5, md: 2 },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mr: 0.5,
            flexShrink: 0,
          }}
        >
          <Box
            component="img"
            src="/logo-sidebar.png"
            alt=""
            sx={{ height: 28, width: "auto", display: "block" }}
          />
          <Typography
            variant="subtitle1"
            noWrap
            sx={{
              color: SHELL_FG,
              fontWeight: 600,
              letterSpacing: 0.2,
              display: { sm: "none", md: "block" },
            }}
          >
            Sugarplum
          </Typography>
        </Box>
        <Box
          component="nav"
          aria-label="Main"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            flex: 1,
            minWidth: 0,
            overflowX: "auto",
          }}
        >
          {drawerNav.map((item) => {
            const selected = active === item.id;
            return (
              <ButtonBase
                key={item.id}
                type="button"
                onClick={() => navigateReplace(item.href)}
                aria-current={selected ? "page" : undefined}
                aria-label={item.label}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.1,
                  minWidth: 48,
                  minHeight: 44,
                  px: 0.75,
                  py: 0.5,
                  borderRadius: 1,
                  color: selected ? SHELL_FG : SHELL_MUTED,
                  bgcolor: selected ? "rgba(91, 44, 111, 0.35)" : "transparent",
                  borderBottom: selected
                    ? `2px solid ${SHELL_SELECTED}`
                    : "2px solid transparent",
                  "&:hover": {
                    bgcolor: selected
                      ? "rgba(91, 44, 111, 0.45)"
                      : "rgba(245, 245, 245, 0.06)",
                  },
                  "& .MuiSvgIcon-root": { fontSize: "1.15rem" },
                }}
              >
                {item.icon}
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ fontSize: "0.62rem", lineHeight: 1.1 }}
                >
                  {item.label}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>
        {streakChip ? <Box sx={{ flexShrink: 0 }}>{streakChip}</Box> : null}
      </Box>
      {genStatus ? (
        <Box sx={{ px: 2, pb: 1 }}>
          <GenerationStatusStrip status={genStatus} dense />
        </Box>
      ) : null}
    </Box>
  );
}
