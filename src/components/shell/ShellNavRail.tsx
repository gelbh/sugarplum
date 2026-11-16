import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { navigateReplace } from "../../nav/navigate";
import type { ShellGenerationStatus } from "../../shell/resolveShellGenerationStatus";
import GenerationStatusStrip from "./GenerationStatusStrip";
import {
  RAIL_WIDTH,
  SHELL_BG,
  SHELL_FG,
  SHELL_HAIRLINE,
  SHELL_MUTED,
  SHELL_SELECTED,
} from "./chromeTokens";
import type { ShellNavId, ShellNavItem } from "./shellNav";

type Props = {
  drawerNav: ShellNavItem[];
  active: ShellNavId;
  genStatus: ShellGenerationStatus | null;
  streakChip: ReactNode;
};

export default function ShellNavRail({
  drawerNav,
  active,
  genStatus,
  streakChip,
}: Props) {
  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: (theme) => theme.zIndex.drawer,
        width: RAIL_WIDTH,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: SHELL_BG,
        color: SHELL_FG,
        borderRight: `1px solid ${SHELL_HAIRLINE}`,
        boxSizing: "border-box",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 0.5,
          px: 0.5,
          pt: 1.5,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
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
                gap: 0.25,
                minHeight: 44,
                px: 0.5,
                py: 0.75,
                borderRadius: 1,
                color: selected ? SHELL_FG : SHELL_MUTED,
                borderLeft: selected
                  ? `3px solid ${SHELL_SELECTED}`
                  : "3px solid transparent",
                bgcolor: selected ? "rgba(91, 44, 111, 0.28)" : "transparent",
                "&:hover": {
                  bgcolor: selected
                    ? "rgba(91, 44, 111, 0.38)"
                    : "rgba(245, 245, 245, 0.06)",
                },
                "& .MuiSvgIcon-root": {
                  fontSize: "1.25rem",
                },
              }}
            >
              {item.icon}
              <Typography
                variant="caption"
                noWrap
                sx={{
                  maxWidth: "100%",
                  fontSize: "0.65rem",
                  lineHeight: 1.1,
                  fontWeight: selected ? 600 : 500,
                }}
              >
                {item.label}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
      {genStatus ? (
        <Box sx={{ px: 0.5, pb: 0.5 }}>
          <GenerationStatusStrip status={genStatus} dense />
        </Box>
      ) : null}
      {streakChip ? (
        <Box
          sx={{
            px: 0.5,
            pb: 1,
            display: "flex",
            justifyContent: "center",
            "& > *": { maxWidth: "100%" },
          }}
        >
          {streakChip}
        </Box>
      ) : null}
    </Box>
  );
}
