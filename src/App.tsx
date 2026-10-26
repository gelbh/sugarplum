import type { ReactNode } from "react";
import AppShell from "./components/AppShell";
import DraftReviewPage from "./routes/DraftReviewPage";
import LibraryPage from "./routes/LibraryPage";
import LoginPage from "./routes/LoginPage";
import RegisterPage from "./routes/RegisterPage";
import SettingsPage from "./routes/SettingsPage";
import StudyPage from "./routes/StudyPage";
import TodayPage from "./routes/TodayPage";

function shell(page: ReactNode) {
  return <AppShell>{page}</AppShell>;
}

export default function App() {
  const path = window.location.pathname;

  if (path === "/login") return <LoginPage />;
  if (path === "/register") return <RegisterPage />;
  if (path === "/library") return shell(<LibraryPage />);
  if (path === "/settings") return shell(<SettingsPage />);
  if (path === "/study") return shell(<StudyPage />);
  if (path === "/today") return shell(<TodayPage />);
  if (/^\/jobs\/[^/]+\/drafts\/?$/.test(path)) return shell(<DraftReviewPage />);

  return shell(<TodayPage />);
}
