import { useEffect, useState, type ReactNode } from "react";
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
import { StudyChromeProvider } from "./study/StudyChromeContext";

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
      <AppInner />
    </StudyChromeProvider>
  );
}

function AppInner() {
  const [loc, setLoc] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));

  useEffect(() => subscribeLocation(setLoc), []);

  const path = loc.pathname;

  if (path === "/" || path === "") return bare(<HomePage />);
  if (path === "/login") return bare(<LoginPage />);
  if (path === "/register") return bare(<RegisterPage />);
  if (path === "/privacy") return bare(<PrivacyPage />);
  if (path === "/terms") return bare(<TermsPage />);
  if (path === "/data-deletion") return bare(<DataDeletionPage />);
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
