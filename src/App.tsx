import {
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import AppShell from "./components/AppShell";
import BareScroll from "./components/BareScroll";
import GradeButtons from "./components/GradeButtons";
import DraftReviewPage from "./routes/DraftReviewPage";
import HomePage from "./routes/HomePage";
import LibraryPage from "./routes/LibraryPage";
import SubjectPage from "./routes/SubjectPage";
import DeckHubPage from "./routes/DeckHubPage";
import LoginPage from "./routes/LoginPage";
import RegisterPage from "./routes/RegisterPage";
import PrivacyPage from "./routes/PrivacyPage";
import TermsPage from "./routes/TermsPage";
import DataDeletionPage from "./routes/DataDeletionPage";
import SettingsPage from "./routes/SettingsPage";
import StudyPage from "./routes/StudyPage";
import TodayPage from "./routes/TodayPage";
import AdminPage from "./routes/AdminPage";
import AdminUserPage from "./routes/AdminUserPage";
import { navigateReplace, subscribeLocation } from "./nav/navigate";
import { UnlockToastProvider } from "./achievements/UnlockToastProvider";
import AchievementsPage from "./routes/AchievementsPage";
import { StudyChromeProvider } from "./study/StudyChromeContext";
import AtlasLoading from "./atlas/AtlasLoading";
import { isAtlasToAtlas, matchAtlasPath } from "./atlas/paths";
import {
  anatomySceneHref,
  canonicalAnatomySceneId,
  matchAnatomyPath,
} from "./anatomy/paths";
import AtlasHub from "./routes/AtlasHub";
import ParasitologyAtlasBounce from "./routes/ParasitologyAtlasBounce";
import AnatomyHub from "./routes/AnatomyHub";
import SessionBootstrap from "./session/SessionBootstrap";

// Keeps the dataset and its schemas out of the main chunk.
const AtlasPage = lazy(() => import("./routes/AtlasPage"));
const AnatomyViewerPage = lazy(() => import("./routes/AnatomyViewerPage"));
// Recharts lives under Insights; keep it off other routes.
const InsightsPage = lazy(() => import("./routes/InsightsPage"));

const SUBJECT_PATH = /^\/library\/subjects\/([^/]+)\/?$/;
const DECK_PATH = /^\/library\/decks\/([^/]+)\/?$/;
const ADMIN_USER_PATH = /^\/admin\/users\/([^/]+)\/?$/;

function shell(page: ReactNode) {
  return <AppShell>{page}</AppShell>;
}

function bare(page: ReactNode) {
  return <BareScroll>{page}</BareScroll>;
}

/** Legacy ids (e.g. canine-limb) resolve to the species mega-scene and replace the URL. */
function AnatomySceneRoute({ rawSceneId }: { rawSceneId: string }) {
  const sceneId = canonicalAnatomySceneId(rawSceneId);
  useEffect(() => {
    if (sceneId !== rawSceneId) {
      navigateReplace(anatomySceneHref(sceneId));
    }
  }, [rawSceneId, sceneId]);
  return (
    <Suspense
      fallback={
        <Typography color="text.secondary">Loading anatomy…</Typography>
      }
    >
      <AnatomyViewerPage key={sceneId} sceneId={sceneId} />
    </Suspense>
  );
}

function matchPage(path: string, search: string): ReactNode {
  if (path === "/" || path === "") return bare(<HomePage />);
  if (path === "/login") return bare(<LoginPage />);
  if (path === "/register") return bare(<RegisterPage />);
  if (path === "/privacy") return bare(<PrivacyPage />);
  if (path === "/terms") return bare(<TermsPage />);
  if (path === "/data-deletion") return bare(<DataDeletionPage />);

  const atlasMatch = matchAtlasPath(path);
  if (atlasMatch?.kind === "hub") {
    return shell(<AtlasHub />);
  }
  if (atlasMatch?.kind === "legacy") {
    return shell(<ParasitologyAtlasBounce />);
  }
  if (atlasMatch?.kind === "atlas") {
    return shell(
      <Suspense fallback={<AtlasLoading />}>
        <AtlasPage
          key={atlasMatch.atlasId}
          atlasId={atlasMatch.atlasId}
          route={atlasMatch.route}
        />
      </Suspense>,
    );
  }

  const subjectMatch = path.match(SUBJECT_PATH);
  if (subjectMatch) {
    return shell(
      <SubjectPage subjectId={decodeURIComponent(subjectMatch[1])} />,
    );
  }

  const deckMatch = path.match(DECK_PATH);
  if (deckMatch) {
    const deckId = decodeURIComponent(deckMatch[1]);
    return shell(<DeckHubPage key={deckId} deckId={deckId} />);
  }

  if (path === "/library") return shell(<LibraryPage />);

  const anatomyMatch = matchAnatomyPath(path);
  if (anatomyMatch?.kind === "hub") {
    return shell(<AnatomyHub />);
  }
  if (anatomyMatch?.kind === "scene") {
    return shell(
      <AnatomySceneRoute rawSceneId={anatomyMatch.sceneId} />,
    );
  }

  if (path === "/settings") return shell(<SettingsPage />);
  if (path === "/achievements") return shell(<AchievementsPage />);
  // Remount when search changes so scoped study does not freeze the old filter.
  if (path === "/study") {
    return shell(<StudyPage key={search || "global"} />);
  }
  if (path === "/today") return shell(<TodayPage />);
  if (path === "/insights") {
    return shell(
      <Suspense
        fallback={
          <Typography color="text.secondary">Loading insights…</Typography>
        }
      >
        <InsightsPage />
      </Suspense>,
    );
  }

  // Local preview for grade button chrome (not shipped in production builds).
  if (import.meta.env.MODE !== "production" && path === "/dev/grades") {
    return (
      <Box
        sx={{
          minHeight: "100dvh",
          bgcolor: "var(--sp-stage-bg, #1e0d1b)",
          color: "var(--sp-ivory, #e8d8c7)",
          display: "grid",
          placeItems: "center",
          p: 2,
        }}
      >
        <GradeButtons onGrade={() => undefined} />
      </Box>
    );
  }

  if (/^\/jobs\/[^/]+\/drafts\/?$/.test(path)) {
    return shell(<DraftReviewPage />);
  }
  if (path === "/admin") return shell(<AdminPage />);

  const adminUserMatch = path.match(ADMIN_USER_PATH);
  if (adminUserMatch) {
    return shell(
      <AdminUserPage
        key={adminUserMatch[1]}
        userId={decodeURIComponent(adminUserMatch[1])}
      />,
    );
  }

  return shell(<TodayPage />);
}

export default function App() {
  return (
    <StudyChromeProvider>
      <UnlockToastProvider>
        <AppInner />
      </UnlockToastProvider>
    </StudyChromeProvider>
  );
}

const currentLocation = () => ({
  pathname: window.location.pathname,
  search: window.location.search,
});

function AppInner() {
  const [loc, setLoc] = useState(currentLocation);
  const pathRef = useRef(loc.pathname);

  useEffect(
    () =>
      subscribeLocation((next) => {
        const prev = pathRef.current;
        pathRef.current = next.pathname;
        if (!isAtlasToAtlas(prev, next.pathname)) {
          setLoc(next);
          return;
        }
        // React skips view transitions for updates made during a browser Back/Forward popstate.
        setTimeout(() => startTransition(() => setLoc(currentLocation())), 0);
      }),
    [],
  );

  const path = loc.pathname;
  return (
    <SessionBootstrap pathname={path}>
      {matchPage(path, loc.search)}
    </SessionBootstrap>
  );
}
