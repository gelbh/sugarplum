import DraftReviewPage from "./routes/DraftReviewPage";
import LibraryPage from "./routes/LibraryPage";
import LoginPage from "./routes/LoginPage";
import RegisterPage from "./routes/RegisterPage";
import SettingsPage from "./routes/SettingsPage";
import StudyPage from "./routes/StudyPage";
import TodayPage from "./routes/TodayPage";

export default function App() {
  const path = window.location.pathname;

  if (path === "/login") return <LoginPage />;
  if (path === "/register") return <RegisterPage />;
  if (path === "/library") return <LibraryPage />;
  if (path === "/settings") return <SettingsPage />;
  if (path === "/study") return <StudyPage />;
  if (path === "/today") return <TodayPage />;
  if (/^\/jobs\/[^/]+\/drafts\/?$/.test(path)) return <DraftReviewPage />;

  return <TodayPage />;
}
