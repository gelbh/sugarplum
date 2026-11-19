import { useRef, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ApiError } from "../api/client";
import GoogleSignInButton from "../components/GoogleSignInButton";
import PublicNightShell from "../components/PublicNightShell";
import TurnstileWidget, {
  type TurnstileWidgetHandle,
} from "../components/TurnstileWidget";
import { continueAsGuest } from "../guest/enterGuest";
import { useSession } from "../session/SessionContext";

function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "oauth_link_required") {
    return "This email already has a password account. Sign in with email and password, then link Google under Settings.";
  }
  if (code === "oauth_conflict") {
    return "This email is linked to a different Google account.";
  }
  if (code === "oauth_denied") {
    return "Google Sign-In was cancelled.";
  }
  if (code === "oauth") {
    return "Google Sign-In failed. Try again.";
  }
  return null;
}

export default function LoginPage() {
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return oauthErrorMessage(params.get("error"));
  });
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Complete the verification challenge first");
      return;
    }
    setBusy(true);
    try {
      await login(email, password, token);
      window.location.assign("/today");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("Verification failed. Please try again.");
      } else {
        setError(err instanceof ApiError ? err.message : "Login failed");
      }
      turnstileRef.current?.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicNightShell maxWidth="xs">
      <Typography
        variant="h6"
        component="h1"
        sx={{
          m: 0,
          mb: 0.75,
          fontWeight: 400,
          textAlign: "center",
          color: "text.secondary",
        }}
      >
        Sign in
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 3, textAlign: "center" }}
      >
        Welcome back.
      </Typography>
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            required
            fullWidth
          />
          <TurnstileWidget
            action="login"
            onToken={setToken}
            widgetRef={turnstileRef}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={busy || !token}
            fullWidth
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <Divider>or</Divider>
          <GoogleSignInButton />
          <Button
            variant="text"
            fullWidth
            disabled={busy}
            onClick={() => continueAsGuest()}
          >
            Continue as guest
          </Button>
          <Typography variant="body2" textAlign="center" color="text.secondary">
            Guest keeps decks and reviews in this browser only.
          </Typography>
          <Typography variant="body2" textAlign="center">
            No account?{" "}
            <Link href="/register" underline="hover">
              Register
            </Link>
          </Typography>
          <Typography variant="body2" textAlign="center" color="text.secondary">
            <Link href="/privacy" underline="hover">
              Privacy
            </Link>
            {" · "}
            <Link href="/terms" underline="hover">
              Terms
            </Link>
          </Typography>
        </Stack>
      </Box>
    </PublicNightShell>
  );
}
