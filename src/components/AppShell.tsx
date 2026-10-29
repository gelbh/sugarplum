import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import InsightsIcon from "@mui/icons-material/Insights";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import SettingsIcon from "@mui/icons-material/Settings";
import TodayIcon from "@mui/icons-material/Today";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { navigateReplace } from "../nav/navigate";
import GlobalProgressBar from "../progress/GlobalProgressBar";
import { ProgressProvider } from "../progress/ProgressProvider";
import { useShellGenerationStatus } from "../shell/useShellGenerationStatus";
import { useStudyChrome } from "../study/StudyChromeContext";
import BottomChrome from "./shell/BottomChrome";
import GenerationStatusStrip from "./shell/GenerationStatusStrip";
import TopChrome from "./shell/TopChrome";
import {
  BOTTOM_NAV_HEIGHT,
  SHELL_BG,
  SHELL_FG,
  SHELL_HAIRLINE,
  SHELL_MUTED,
  SHELL_SELECTED,
  TOP_BAR_HEIGHT,
} from "./shell/chromeTokens";
import type { ShellNavId } from "./shell/shellNav";

const DRAWER_WIDTH = 220;

type NavItem = {
  id: ShellNavId;
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
    icon: <TodayIcon fontSize="small" />,
    match: (path) => path === "/today" || path === "/study",
  },
  {
    id: "insights",
    label: "Insights",
    href: "/insights",
    icon: <InsightsIcon fontSize="small" />,
    match: (path) => path === "/insights",
  },
  {
    id: "library",
    label: "Library",
    href: "/library",
    icon: <LibraryBooksIcon fontSize="small" />,
    match: (path) =>
      path === "/library" ||
      path.startsWith("/library/") ||
      /^\/jobs\/[^/]+\/drafts\/?$/.test(path),
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: <SettingsIcon fontSize="small" />,
    match: (path) => path === "/settings",
  },
];

function activeNavId(path: string): ShellNavId {
  const hit = NAV.find((item) => item.match(path));
  return hit?.id ?? "today";
}

type AppShellProps = {
  children: ReactNode;
};

function AppShellChrome({ children }: AppShellProps) {
  const { hideChrome } = useStudyChrome();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const path = window.location.pathname;
  const active = activeNavId(path);
  const showDrawer = !hideChrome && !mobile;
  const showMobileChrome = !hideChrome && mobile;
  const genStatus = useShellGenerationStatus(hideChrome);
  const headerRef = useRef<HTMLDivElement>(null);
  const [mobileHeaderPx, setMobileHeaderPx] = useState(TOP_BAR_HEIGHT);

  useLayoutEffect(() => {
    if (!showMobileChrome) return;
    const el = headerRef.current;
    if (!el) return;
    const measure = () => {
      setMobileHeaderPx(Math.ceil(el.getBoundingClientRect().height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showMobileChrome, genStatus]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
        bgcolor: "background.default",
        ...(showMobileChrome
          ? {
              pt: `${mobileHeaderPx}px`,
              pb: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
            }
          : {}),
      }}
    >
      <GlobalProgressBar
        stickyTop={showMobileChrome ? `${mobileHeaderPx}px` : 0}
      />
      {showMobileChrome ? (
        <Box
          ref={headerRef}
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1100,
            bgcolor: SHELL_BG,
          }}
        >
          <TopChrome />
          {genStatus ? (
            <GenerationStatusStrip status={genStatus} dense />
          ) : null}
        </Box>
      ) : null}
      {showDrawer ? (
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
            {NAV.map((item) => {
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
      ) : null}
      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          bgcolor: "background.default",
          ...(showDrawer
            ? {
                width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
                ml: { md: `${DRAWER_WIDTH}px` },
              }
            : {}),
        }}
      >
        {children}
      </Box>
      {showMobileChrome ? (
        <BottomChrome
          active={active}
          items={NAV}
          onNavigate={navigateReplace}
          libraryBadgeKind={genStatus?.kind ?? null}
        />
      ) : null}
    </Box>
  );
}

/** Authenticated chrome: permanent drawer on desktop, top + bottom chrome on mobile. */
export default function AppShell({ children }: AppShellProps) {
  return (
    <ProgressProvider>
      <AppShellChrome>{children}</AppShellChrome>
    </ProgressProvider>
  );
}
