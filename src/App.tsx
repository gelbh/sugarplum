import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DraftReviewPage from "./routes/DraftReviewPage";
import LibraryPage from "./routes/LibraryPage";
import LoginPage from "./routes/LoginPage";
import RegisterPage from "./routes/RegisterPage";
import SettingsPage from "./routes/SettingsPage";

export default function App() {
  const path = window.location.pathname;

  if (path === "/login") return <LoginPage />;
  if (path === "/register") return <RegisterPage />;
  if (path === "/library") return <LibraryPage />;
  if (path === "/settings") return <SettingsPage />;
  if (/^\/jobs\/[^/]+\/drafts\/?$/.test(path)) return <DraftReviewPage />;

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h3" component="h1" gutterBottom color="primary">
        Sugarplum
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Spaced-repetition study shell. More surfaces land in later tasks.
      </Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <Button variant="contained" href="/library">
          Library
        </Button>
        <Button variant="outlined" href="/settings">
          Settings
        </Button>
        <Button variant="outlined" href="/login">
          Sign in
        </Button>
        <Button variant="outlined" href="/register">
          Register
        </Button>
      </Stack>
    </Container>
  );
}
