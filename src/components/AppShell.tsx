import type { ReactNode } from "react";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import SettingsIcon from "@mui/icons-material/Settings";
import TodayIcon from "@mui/icons-material/Today";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import GlobalProgressBar from "../progress/GlobalProgressBar";
import { ProgressProvider } from "../progress/ProgressProvider";

const DRAWER_WIDTH = 240;

type NavId = "today" | "library" | "settings";

type NavItem = {
  id: NavId;
  label: string;
  href: string;
  icon: ReactNode;
  match: (path: string) => boolean;
};

const NAV: NavItem[] = [
  {
    id: "today",
    label: "Today",
    href: "/today",
    icon: <TodayIcon />,
    match: (path) => path === "/" || path === "/today" || path === "/study",
  },
  {
    id: "library",
    label: "Library",
    href: "/library",
    icon: <LibraryBooksIcon />,
    match: (path) =>
      path === "/library" || /^\/jobs\/[^/]+\/drafts\/?$/.test(path),
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: <SettingsIcon />,
    match: (path) => path === "/settings",
  },
];

function activeNavId(path: string): NavId {
  const hit = NAV.find((item) => item.match(path));
  return hit?.id ?? "today";
}

type AppShellProps = {
  children: ReactNode;
};

/** Authenticated chrome: permanent drawer on desktop, bottom nav on mobile. */
export default function AppShell({ children }: AppShellProps) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const path = window.location.pathname;
  const active = activeNavId(path);

  const shell = mobile ? (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        pb: 7,
      }}
    >
      <GlobalProgressBar />
      <Box component="main" sx={{ flex: 1 }}>
        {children}
      </Box>
      <Paper
        elevation={3}
        sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1100 }}
      >
        <BottomNavigation
          showLabels
          value={active}
          onChange={(_e, value: NavId) => {
            const item = NAV.find((n) => n.id === value);
            if (item) window.location.assign(item.href);
          }}
        >
          {NAV.map((item) => (
            <BottomNavigationAction
              key={item.id}
              label={item.label}
              value={item.id}
              icon={item.icon}
            />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  ) : (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
          },
        }}
      >
        <Toolbar sx={{ gap: 1.5 }}>
          <Box
            component="img"
            src="/logo-sidebar.png"
            alt=""
            sx={{ height: 32, width: "auto", display: "block" }}
          />
          <Typography variant="h6" color="primary" noWrap>
            Sugarplum
          </Typography>
        </Toolbar>
        <List>
          {NAV.map((item) => (
            <ListItemButton
              key={item.id}
              selected={active === item.id}
              href={item.href}
              component="a"
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box
        component="main"
        sx={{ flexGrow: 1, width: { md: `calc(100% - ${DRAWER_WIDTH}px)` } }}
      >
        <GlobalProgressBar />
        {children}
      </Box>
    </Box>
  );

  return <ProgressProvider>{shell}</ProgressProvider>;
}
