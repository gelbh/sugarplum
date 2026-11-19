import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { navigateReplace } from "../../shared/nav/navigate";
import type { ShellGenerationStatus } from "./resolveShellGenerationStatus";
import GenerationStatusStrip from "./GenerationStatusStrip";
import {
  RAIL_WIDTH,
  SHELL_BG,
  SHELL_FG,
  SHELL_MUTED,
  SHELL_SELECTED,
} from "./chromeTokens";
import type { ShellNavId, ShellNavItem } from "./shellNav";

type Props = {
  drawerNav: ShellNavItem[];
  active: ShellNavId;
  genStatus: ShellGenerationStatus | null;
  width?: number;
};

export default function ShellNavRail({
  drawerNav,
  active,
  genStatus,
  width = RAIL_WIDTH,
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
        width,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: SHELL_BG,
        color: SHELL_FG,
        borderRight: "none",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 56,
          px: 0.75,
          borderBottom: "1px solid",
          borderColor: "rgba(245, 245, 245, 0.08)",
        }}
      >
        <ButtonBase
          type="button"
          onClick={() => navigateReplace("/today")}
          aria-label="Sugarplum"
          title="Sugarplum"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 1,
            p: 0.5,
            "&:hover": { bgcolor: "rgba(245, 245, 245, 0.06)" },
          }}
        >
          <Box
            component="img"
            src="/logo-sidebar.png"
            alt=""
            sx={{ height: 28, width: "auto", display: "block" }}
          />
        </ButtonBase>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 0.5,
          px: 0.5,
          pt: 1,
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
              title={item.label}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
            </ButtonBase>
          );
        })}
      </Box>
      {genStatus ? (
        <Box
          sx={{
            flexShrink: 0,
            px: 0.75,
            pt: 0.5,
            pb: 1,
            borderTop: "1px solid",
            borderColor: "rgba(245, 245, 245, 0.08)",
          }}
        >
          <GenerationStatusStrip status={genStatus} rail />
        </Box>
      ) : null}
    </Box>
  );
}
