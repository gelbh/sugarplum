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
import { ATLAS_LEGACY_PATH } from "../atlas/paths";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { GAMIFICATION_CHANGED_EVENT, getGamification } from "../api/client";
import StreakXpChip from "../achievements/StreakXpChip";
import { isGuest } from "../guest/session";
import { navigateReplace } from "../nav/navigate";
import { useMainScrollRestore } from "../nav/scrollRestore";
import GlobalProgressBar from "../progress/GlobalProgressBar";
import { ProgressProvider } from "../progress/ProgressProvider";
import { useSession } from "../session/SessionContext";
import { useShellGenerationStatus } from "../shell/useShellGenerationStatus";
import { useStudyChrome } from "../study/StudyChromeContext";
import BottomChrome from "./shell/BottomChrome";
import GenerationStatusStrip from "./shell/GenerationStatusStrip";
import { ShellBackOverrideProvider } from "./shell/ShellBackOverride";
import TopChrome from "./shell/TopChrome";
import TopPictogramBand from "./shell/TopPictogramBand";
import {
  BOTTOM_NAV_HEIGHT,
  SHELL_BG,
  TOP_BAND_HEIGHT,
  TOP_BAR_HEIGHT,
} from "./shell/chromeTokens";
import { resolveShellSideChrome } from "./shell/shellSideChrome";
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
    label: "Medals",
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
  const { user } = useSession();
  const { hideChrome } = useStudyChrome();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const path = window.location.pathname;
  const isAdmin = !isGuest() && user?.is_admin === true;
  const [streak, setStreak] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const drawerNav = isAdmin ? [...LEARNER_NAV, ADMIN_NAV] : LEARNER_NAV;
  const active = activeNavId(path, drawerNav);
  const { topBand } = resolveShellSideChrome(phone, false, hideChrome);
  const showMobileChrome = !hideChrome && phone;
  const genStatus = useShellGenerationStatus(hideChrome);
  const headerRef = useRef<HTMLDivElement>(null);
  const [mobileHeaderPx, setMobileHeaderPx] = useState(TOP_BAR_HEIGHT);
  const mainRef = useRef<HTMLElement>(null);
  useMainScrollRestore(mainRef);

  // Zen hides the chip, so refetch on leaving zen instead of after every grade.
  useEffect(() => {
    if (hideChrome || isGuest()) return;
    let latest = 0;
    const load = () => {
      const req = ++latest;
      void getGamification()
        .then((g) => {
          if (req !== latest) return;
          setStreak(g.streakCurrent);
          setLevel(g.level);
        })
        .catch(() => {
          if (req === latest) setStreak(null);
        });
    };
    load();
    window.addEventListener(GAMIFICATION_CHANGED_EVENT, load);
    return () => {
      latest = -1;
      window.removeEventListener(GAMIFICATION_CHANGED_EVENT, load);
    };
  }, [hideChrome]);

  const streakChip =
    !isGuest() && streak != null && level != null ? (
      <StreakXpChip streak={streak} level={level} />
    ) : null;

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
          : topBand
            ? { pt: `${TOP_BAND_HEIGHT}px` }
            : {}),
      }}
    >
      <GlobalProgressBar
        top={showMobileChrome ? mobileHeaderPx : topBand ? TOP_BAND_HEIGHT : 0}
      />
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
          <TopChrome trailing={streakChip} />
          {genStatus ? (
            <GenerationStatusStrip status={genStatus} dense />
          ) : null}
        </Box>
      ) : null}
      {topBand ? (
        <TopPictogramBand
          drawerNav={drawerNav}
          active={active}
          genStatus={genStatus}
          streakChip={streakChip}
        />
      ) : null}
      <Box
        ref={mainRef}
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          bgcolor: "background.default",
        }}
      >
        {children}
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

/** Authenticated chrome: dock below sm; slim top pictogram band from sm up. */
export default function AppShell({ children }: AppShellProps) {
  return (
    <ProgressProvider>
      <ShellBackOverrideProvider>
        <AppShellChrome>{children}</AppShellChrome>
      </ShellBackOverrideProvider>
    </ProgressProvider>
  );
}
