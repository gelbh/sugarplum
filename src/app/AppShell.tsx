import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import InsightsIcon from "@mui/icons-material/Insights";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import MilitaryTechIcon from "@mui/icons-material/MilitaryTech";
import SettingsIcon from "@mui/icons-material/Settings";
import TodayIcon from "@mui/icons-material/Today";
import { ATLAS_LEGACY_PATH } from "../atlas";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { adminExitImpersonation } from "../api/client";
import { isGuest } from "../guest/session";
import { navigate, navigateReplace, subscribeLocation } from "../shared/nav/navigate";
import PageLoadingOverlay from "../progress/PageLoadingOverlay";
import { useRouteLoadOverlay } from "../progress/useRouteLoadOverlay";
import { useMainScrollRestore } from "../shared/nav/scrollRestore";
import GlobalProgressBar from "../progress/GlobalProgressBar";
import { ProgressProvider } from "../progress/ProgressProvider";
import { useSession } from "../session/SessionContext";
import { useShellGenerationStatus } from "./shell/useShellGenerationStatus";
import { useStudyChrome } from "../study";
import BottomChrome from "./shell/BottomChrome";
import DesktopDrawer from "./shell/DesktopDrawer";
import GenerationStatusStrip from "./shell/GenerationStatusStrip";
import ShellNavRail from "./shell/ShellNavRail";
import ShellSidebarEdgeBar, {
  SHELL_SIDEBAR_SNAP_MID,
} from "./shell/ShellSidebarEdgeBar";
import { ShellBackOverrideProvider } from "./shell/ShellBackOverride";
import TopChrome from "./shell/TopChrome";
import {
  BOTTOM_NAV_HEIGHT,
  SHELL_BG,
  TOP_BAR_HEIGHT,
} from "./shell/chromeTokens";
import { resolveShellSideChrome } from "./shell/shellSideChrome";
import {
  loadShellSidebarCollapsed,
  saveShellSidebarCollapsed,
} from "./shell/shellSidebarPreference";
import type { ShellNavId, ShellNavItem } from "./shell/shellNav";

type NavItem = ShellNavItem & {
  match: (path: string) => boolean;
};

/** Learner tabs only; never include Admin (mobile BottomChrome uses this). */
const LEARNER_NAV: NavItem[] = [
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
      (path === "/library" ||
        path.startsWith("/library/") ||
        /^\/jobs\/[^/]+\/drafts\/?$/.test(path)) &&
      !ATLAS_LEGACY_PATH.test(path),
  },
  {
    id: "atlas",
    label: "Atlas",
    href: "/atlas",
    icon: <MenuBookIcon fontSize="small" />,
    match: (path) =>
      path === "/atlas" ||
      path.startsWith("/atlas/") ||
      path === "/anatomy" ||
      path.startsWith("/anatomy/") ||
      ATLAS_LEGACY_PATH.test(path),
  },
  {
    id: "achievements",
    label: "Fruits",
    href: "/achievements",
    icon: <MilitaryTechIcon fontSize="small" />,
    match: (path) => path === "/achievements",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: <SettingsIcon fontSize="small" />,
    match: (path) => path === "/settings",
  },
];

const ADMIN_NAV: NavItem = {
  id: "admin",
  label: "Admin",
  href: "/admin",
  icon: <AdminPanelSettingsIcon fontSize="small" />,
  match: (path) => path === "/admin" || path.startsWith("/admin/"),
};

function activeNavId(path: string, drawerItems: NavItem[]): ShellNavId {
  const hit = drawerItems.find((item) => item.match(path));
  if (hit) return hit.id;
  if (ADMIN_NAV.match(path)) return "admin";
  return "today";
}

type AppShellProps = {
  children: ReactNode;
};

function AppShellChrome({ children }: AppShellProps) {
  const { user, refreshSession } = useSession();
  const { hideChrome } = useStudyChrome();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const medium = useMediaQuery(theme.breakpoints.between("sm", "md"));
  const path = window.location.pathname;
  const isAdmin = !isGuest() && user?.is_admin === true;
  const impersonation = user?.impersonation ?? null;
  const [stopBusy, setStopBusy] = useState(false);
  const drawerNav = isAdmin ? [...LEARNER_NAV, ADMIN_NAV] : LEARNER_NAV;
  const active = activeNavId(path, drawerNav);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean | null>(() =>
    loadShellSidebarCollapsed(),
  );
  const [dragSideWidth, setDragSideWidth] = useState<number | null>(null);
  const resolvedSide = resolveShellSideChrome(
    phone,
    medium,
    hideChrome,
    sidebarCollapsed,
  );
  const collapsedNow =
    dragSideWidth != null
      ? dragSideWidth < SHELL_SIDEBAR_SNAP_MID
      : resolvedSide.side === "rail";
  const side =
    dragSideWidth != null
      ? collapsedNow
        ? "rail"
        : "drawer"
      : resolvedSide.side;
  const sideWidth = dragSideWidth ?? resolvedSide.sideWidth;
  const showMobileChrome = !hideChrome && phone;
  const genStatus = useShellGenerationStatus(hideChrome);
  const headerRef = useRef<HTMLDivElement>(null);
  const [mobileHeaderPx, setMobileHeaderPx] = useState(TOP_BAR_HEIGHT);
  const mainRef = useRef<HTMLElement>(null);
  const [routeKey, setRouteKey] = useState(
    () => `${window.location.pathname}${window.location.search}`,
  );
  const routeOverlay = useRouteLoadOverlay();
  // Draft review owns progress via JobProgressPanel; skip the thin top bar there.
  const hideGlobalProgress = /^\/jobs\/[^/]+\/drafts\/?$/.test(
    routeKey.split("?")[0] ?? "",
  );
  useMainScrollRestore(mainRef);

  useEffect(
    () =>
      subscribeLocation((loc) => {
        setRouteKey(`${loc.pathname}${loc.search}`);
      }),
    [],
  );

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--shell-side-width",
      `${sideWidth}px`,
    );
    return () => {
      document.documentElement.style.removeProperty("--shell-side-width");
    };
  }, [sideWidth]);

  function setCollapsed(next: boolean) {
    setSidebarCollapsed(next);
    saveShellSidebarCollapsed(next);
  }

  async function onStopImpersonation() {
    if (stopBusy) return;
    setStopBusy(true);
    try {
      await adminExitImpersonation();
      await refreshSession();
      navigate("/admin");
    } catch {
      // Exit may 400 if TTL already restored the actor; still refresh UI.
      try {
        await refreshSession();
        navigate("/admin");
      } catch {
        setStopBusy(false);
      }
    }
  }

  // Clear stale "Viewing as" after absolute TTL (server may already have restored actor).
  useEffect(() => {
    if (!impersonation?.expiresAt) return;
    const ms = impersonation.expiresAt - Date.now();
    const clear = async () => {
      await refreshSession();
      navigate("/admin");
    };
    if (ms <= 0) {
      void clear();
      return;
    }
    const t = window.setTimeout(() => {
      void clear();
    }, ms);
    return () => window.clearTimeout(t);
  }, [impersonation?.expiresAt, refreshSession]);

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
      {impersonation ? (
        <Alert
          severity="warning"
          sx={{
            borderRadius: 0,
            position: "sticky",
            top: 0,
            zIndex: (t) => t.zIndex.appBar + 2,
            flexShrink: 0,
            ...(sideWidth > 0
              ? {
                  width: `calc(100% - ${sideWidth}px)`,
                  ml: `${sideWidth}px`,
                }
              : {}),
          }}
          action={
            <Button
              color="inherit"
              size="small"
              disabled={stopBusy}
              onClick={() => void onStopImpersonation()}
            >
              Stop
            </Button>
          }
        >
          Viewing as {impersonation.sourceEmail} (read-only)
        </Alert>
      ) : null}
      {routeOverlay || hideGlobalProgress ? null : (
        <GlobalProgressBar top={showMobileChrome ? mobileHeaderPx : 0} />
      )}
      {showMobileChrome ? (
        <Box
          ref={headerRef}
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: (theme) => theme.zIndex.appBar,
            bgcolor: SHELL_BG,
          }}
        >
          <TopChrome />
          {genStatus ? (
            <GenerationStatusStrip status={genStatus} dense />
          ) : null}
        </Box>
      ) : null}
      {side === "rail" ? (
        <ShellNavRail
          drawerNav={drawerNav}
          active={active}
          genStatus={genStatus}
          width={sideWidth}
        />
      ) : null}
      {side === "drawer" ? (
        <DesktopDrawer
          drawerNav={drawerNav}
          active={active}
          genStatus={genStatus}
          width={sideWidth}
        />
      ) : null}
      {side === "rail" || side === "drawer" ? (
        <ShellSidebarEdgeBar
          sideWidth={sideWidth}
          collapsed={collapsedNow}
          onCollapsedChange={setCollapsed}
          onDragWidth={setDragSideWidth}
        />
      ) : null}
      <Box
        ref={mainRef}
        component="main"
        sx={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          bgcolor: "background.default",
          ...(sideWidth > 0
            ? {
                width: `calc(100% - ${sideWidth}px)`,
                ml: `${sideWidth}px`,
              }
            : {}),
        }}
      >
        <Box
          key={routeKey}
          sx={{
            height: "100%",
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
            animation: "shellPageIn 320ms cubic-bezier(0.2, 0, 0, 1)",
            "@keyframes shellPageIn": {
              from: { opacity: 0, transform: "translateY(10px)" },
              to: { opacity: 1, transform: "translateY(0)" },
            },
            "@media (prefers-reduced-motion: reduce)": {
              animation: "none",
            },
          }}
        >
          {children}
        </Box>
        <PageLoadingOverlay snapshot={routeOverlay} />
      </Box>
      {showMobileChrome ? (
        <BottomChrome
          active={active === "admin" ? "today" : active}
          items={LEARNER_NAV}
          onNavigate={navigateReplace}
          libraryBadgeKind={genStatus?.kind ?? null}
        />
      ) : null}
    </Box>
  );
}

/** Authenticated chrome: dock below sm; desktop sidebar toggleable rail ↔ drawer. */
export default function AppShell({ children }: AppShellProps) {
  return (
    <ProgressProvider>
      <ShellBackOverrideProvider>
        <AppShellChrome>{children}</AppShellChrome>
      </ShellBackOverrideProvider>
    </ProgressProvider>
  );
}
