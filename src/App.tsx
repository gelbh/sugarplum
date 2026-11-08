import {
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AppShell from "./components/AppShell";
import BareScroll from "./components/BareScroll";
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
import InsightsPage from "./routes/InsightsPage";
import StudyPage from "./routes/StudyPage";
import TodayPage from "./routes/TodayPage";
import AdminPage from "./routes/AdminPage";
import AdminUserPage from "./routes/AdminUserPage";
import { subscribeLocation } from "./nav/navigate";
import { UnlockToastProvider } from "./achievements/UnlockToastProvider";
import AchievementsPage from "./routes/AchievementsPage";
import { StudyChromeProvider } from "./study/StudyChromeContext";
import AtlasLoading from "./atlas/AtlasLoading";
import { isAtlasToAtlas, matchAtlasPath } from "./atlas/paths";

// Keeps the dataset and its schemas out of the main chunk.
const AtlasPage = lazy(() => import("./routes/AtlasPage"));

const SUBJECT_PATH = /^\/library\/subjects\/([^/]+)\/?$/;
const DECK_PATH = /^\/library\/decks\/([^/]+)\/?$/;
const ADMIN_USER_PATH = /^\/admin\/users\/([^/]+)\/?$/;

function shell(page: ReactNode) {
  return <AppShell>{page}</AppShell>;
}

function bare(page: ReactNode) {
  return <BareScroll>{page}</BareScroll>;
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

  if (path === "/" || path === "") return bare(<HomePage />);
  if (path === "/login") return bare(<LoginPage />);
  if (path === "/register") return bare(<RegisterPage />);
  if (path === "/privacy") return bare(<PrivacyPage />);
  if (path === "/terms") return bare(<TermsPage />);
  if (path === "/data-deletion") return bare(<DataDeletionPage />);
  const atlasMatch = matchAtlasPath(path);
  if (atlasMatch) {
    return shell(
      <Suspense fallback={<AtlasLoading />}>
        <AtlasPage
          key={atlasMatch.subjectId}
          subjectId={atlasMatch.subjectId}
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
  if (path === "/settings") return shell(<SettingsPage />);
  if (path === "/achievements") return shell(<AchievementsPage />);
  // Remount when search changes so scoped study does not freeze the old filter.
  if (path === "/study") {
    return shell(<StudyPage key={loc.search || "global"} />);
  }
  if (path === "/today") return shell(<TodayPage />);
  if (path === "/insights") return shell(<InsightsPage />);
  if (/^\/jobs\/[^/]+\/drafts\/?$/.test(path))
    return shell(<DraftReviewPage />);
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
