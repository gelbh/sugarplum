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
import { ApiError, register } from "../api/client";
import GoogleSignInButton from "../components/GoogleSignInButton";

const MIN_PASSWORD = 12;

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters`);
      return;
    }
    setBusy(true);
    try {
      await register(email, password);
      window.location.assign("/today");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container maxWidth="xs" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom color="primary">
        Create account
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Start building spaced-repetition decks.
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
            autoComplete="new-password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            helperText={`At least ${MIN_PASSWORD} characters`}
            required
            fullWidth
          />
          <Button type="submit" variant="contained" disabled={busy} fullWidth>
            {busy ? "Creating…" : "Register"}
          </Button>
          <Divider>or</Divider>
          <GoogleSignInButton />
          <Typography variant="body2" textAlign="center">
            Already have an account?{" "}
            <Link href="/login" underline="hover">
              Sign in
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
