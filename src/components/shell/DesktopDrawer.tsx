import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { navigateReplace } from "../../nav/navigate";
import type { ShellGenerationStatus } from "../../shell/resolveShellGenerationStatus";
import GenerationStatusStrip from "./GenerationStatusStrip";
import {
  DRAWER_WIDTH,
  SHELL_BG,
  SHELL_FG,
  SHELL_HAIRLINE,
  SHELL_MUTED,
  SHELL_SELECTED,
} from "./chromeTokens";
import type { ShellNavId, ShellNavItem } from "./shellNav";

type DesktopDrawerProps = {
  drawerNav: ShellNavItem[];
  active: ShellNavId;
  genStatus: ShellGenerationStatus | null;
  streakChip: ReactNode;
};

export default function DesktopDrawer({
  drawerNav,
  active,
  genStatus,
  streakChip,
}: DesktopDrawerProps) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          position: "fixed",
          width: DRAWER_WIDTH,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          bgcolor: SHELL_BG,
          color: SHELL_FG,
          borderRight: `1px solid ${SHELL_HAIRLINE}`,
          backgroundImage: "none",
        },
      }}
    >
      <Toolbar
        variant="dense"
        sx={{
          gap: 1.25,
          minHeight: 56,
          px: 2,
          borderBottom: `1px solid ${SHELL_HAIRLINE}`,
        }}
      >
        <Box
          component="img"
          src="/logo-sidebar.png"
          alt=""
          sx={{ height: 28, width: "auto", display: "block" }}
        />
        <Typography
          variant="h6"
          noWrap
          sx={{ color: SHELL_FG, letterSpacing: 0.2 }}
        >
          Sugarplum
        </Typography>
      </Toolbar>
      <List dense sx={{ px: 1, pt: 1.5 }}>
        {drawerNav.map((item) => {
          const selected = active === item.id;
          return (
            <ListItemButton
              key={item.id}
              selected={selected}
              onClick={() => navigateReplace(item.href)}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                color: selected ? SHELL_FG : SHELL_MUTED,
                borderLeft: selected
                  ? `3px solid ${SHELL_SELECTED}`
                  : "3px solid transparent",
                "&.Mui-selected": {
                  bgcolor: "rgba(91, 44, 111, 0.28)",
                },
                "&.Mui-selected:hover": {
                  bgcolor: "rgba(91, 44, 111, 0.38)",
                },
                "&:hover": {
                  bgcolor: "rgba(245, 245, 245, 0.06)",
                },
                "& .MuiListItemIcon-root": {
                  color: "inherit",
                  minWidth: 36,
                },
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  variant: "body2",
                  fontWeight: selected ? 600 : 500,
                }}
              />
            </ListItemButton>
          );
        })}
      </List>
      {genStatus ? (
        <Box sx={{ px: 1, pb: 1 }}>
          <GenerationStatusStrip status={genStatus} />
        </Box>
      ) : null}
      <Box sx={{ flexGrow: 1 }} />
      {streakChip ? <Box sx={{ px: 2, pb: 1.5 }}>{streakChip}</Box> : null}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderTop: `1px solid ${SHELL_HAIRLINE}`,
        }}
      >
        <Typography
          variant="caption"
          component="div"
          sx={{ color: SHELL_MUTED }}
        >
          <Link href="/privacy" underline="hover" color="inherit">
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" underline="hover" color="inherit">
            Terms
          </Link>
          {" · "}
          <Link href="/data-deletion" underline="hover" color="inherit">
            Deletion
          </Link>
        </Typography>
      </Box>
    </Drawer>
  );
}
