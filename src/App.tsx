import { useEffect, useState, type ReactNode } from "react";
import AppShell from "./components/AppShell";
import DraftReviewPage from "./routes/DraftReviewPage";
import HomePage from "./routes/HomePage";
import LibraryPage from "./routes/LibraryPage";
import LoginPage from "./routes/LoginPage";
import RegisterPage from "./routes/RegisterPage";
import PrivacyPage from "./routes/PrivacyPage";
import TermsPage from "./routes/TermsPage";
import DataDeletionPage from "./routes/DataDeletionPage";
import SettingsPage from "./routes/SettingsPage";
import InsightsPage from "./routes/InsightsPage";
import StudyPage from "./routes/StudyPage";
import TodayPage from "./routes/TodayPage";
import { subscribePath } from "./nav/navigate";
import { StudyChromeProvider } from "./study/StudyChromeContext";

function shell(page: ReactNode) {
  return <AppShell>{page}</AppShell>;
}

export default function App() {
  return (
    <StudyChromeProvider>
      <AppInner />
    </StudyChromeProvider>
  );
}

function AppInner() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => subscribePath(setPath), []);

  if (path === "/" || path === "") return <HomePage />;
  if (path === "/login") return <LoginPage />;
  if (path === "/register") return <RegisterPage />;
  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/terms") return <TermsPage />;
  if (path === "/data-deletion") return <DataDeletionPage />;
  if (path === "/library") return shell(<LibraryPage />);
  if (path === "/settings") return shell(<SettingsPage />);
  if (path === "/study") return shell(<StudyPage />);
  if (path === "/today") return shell(<TodayPage />);
  if (path === "/insights") return shell(<InsightsPage />);
  if (/^\/jobs\/[^/]+\/drafts\/?$/.test(path))
    return shell(<DraftReviewPage />);

  return shell(<TodayPage />);
}
