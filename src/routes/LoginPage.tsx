import { useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ApiError, login } from "../api/client";
import GoogleSignInButton from "../components/GoogleSignInButton";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return oauthErrorMessage(params.get("error"));
  });
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container maxWidth="xs" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom color="primary">
        Sign in
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Welcome back to Sugarplum.
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
          <Button type="submit" variant="contained" disabled={busy} fullWidth>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <Divider>or</Divider>
          <GoogleSignInButton />
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
    </Container>
  );
}
