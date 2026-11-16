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
  width?: number;
};

export default function DesktopDrawer({
  drawerNav,
  active,
  genStatus,
  width = DRAWER_WIDTH,
}: DesktopDrawerProps) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          position: "fixed",
          width,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          bgcolor: SHELL_BG,
          color: SHELL_FG,
          borderRight: "none",
          backgroundImage: "none",
          overflow: "hidden",
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
          sx={{ height: 28, width: "auto", display: "block", flexShrink: 0 }}
        />
        <Typography
          variant="h6"
          noWrap
          sx={{ color: SHELL_FG, letterSpacing: 0.2 }}
        >
          Sugarplum
        </Typography>
      </Toolbar>
      <List
        dense
        sx={{ px: 1, pt: 1.5, flex: 1, minHeight: 0, overflowY: "auto" }}
      >
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
      <Box sx={{ flexShrink: 0 }}>
        {genStatus ? (
          <Box sx={{ px: 1, pb: 1 }}>
            <GenerationStatusStrip status={genStatus} />
          </Box>
        ) : null}
        <Box
          component="nav"
          aria-label="Legal"
          sx={{
            px: 1.5,
            pt: 1,
            pb: 1.5,
            borderTop: `1px solid ${SHELL_HAIRLINE}`,
            display: "flex",
            flexDirection: "column",
            gap: 0.25,
          }}
        >
          {(
            [
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
              { href: "/data-deletion", label: "Data deletion" },
            ] as const
          ).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              underline="none"
              color="inherit"
              sx={{
                display: "block",
                px: 0.75,
                py: 0.55,
                borderRadius: 1,
                color: SHELL_MUTED,
                fontSize: "0.8125rem",
                fontWeight: 500,
                letterSpacing: "0.01em",
                textUnderlineOffset: 3,
                transition: "color 120ms ease, background-color 120ms ease",
                "&:hover": {
                  color: SHELL_FG,
                  bgcolor: "rgba(245, 245, 245, 0.06)",
                  textDecoration: "underline",
                },
              }}
            >
              {item.label}
            </Link>
          ))}
        </Box>
      </Box>
    </Drawer>
  );
}
