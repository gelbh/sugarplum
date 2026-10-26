import { useEffect, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useColorScheme } from "@mui/material/styles";
import {
  ApiError,
  getLlmSettings,
  me,
  putLlmSettings,
  type LlmSettings,
} from "../api/client";
import { useTrackedOp } from "../progress/useTrackedOp";

type ThemeMode = "system" | "light" | "dark";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
] as const;

function settingsQueryMessage(): {
  error: string | null;
  notice: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  if (params.get("linked") === "1") {
    return { error: null, notice: "Google account linked." };
  }
  const code = params.get("error");
  if (code === "oauth_conflict") {
    return {
      error: "That Google account is already linked to a different user.",
      notice: null,
    };
  }
  if (code === "oauth_email_mismatch") {
    return {
      error: "Google email must match your Sugarplum account email.",
      notice: null,
    };
  }
  if (code === "oauth_denied") {
    return { error: "Google linking was cancelled.", notice: null };
  }
  if (code === "oauth") {
    return { error: "Google linking failed. Try again.", notice: null };
  }
  return { error: null, notice: null };
}

export default function SettingsPage() {
  const { mode, setMode } = useColorScheme();
  const [provider, setProvider] = useState<string>("openai");
  const [apiKey, setApiKey] = useState("");
  const [current, setCurrent] = useState<LlmSettings | null>(null);
  const [googleLinked, setGoogleLinked] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const queryMsg = settingsQueryMessage();
  const [error, setError] = useState<string | null>(queryMsg.error);
  const [notice, setNotice] = useState<string | null>(queryMsg.notice);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedOp("Loading…", { trackOnMount: true });
  const { busy, begin, end } = useTrackedOp("Saving…");

  const themeMode: ThemeMode =
    mode === "light" || mode === "dark" || mode === "system" ? mode : "system";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await me();
        const settings = await getLlmSettings();
        if (cancelled) return;
        setAccountEmail(user.email);
        setGoogleLinked(user.google_linked === true);
        setCurrent(settings);
        if (settings.configured) setProvider(settings.provider);
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Failed to load settings",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    begin();
    try {
      const saved = await putLlmSettings(provider, apiKey);
      setCurrent(saved);
      setApiKey("");
      setNotice("API key saved (encrypted at rest).");
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save key");
      end(false);
    }
  }

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom color="primary">
        Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Optional. Without a key, Sugarplum uses free platform AI (up to 20 jobs
        per UTC day). Add your own OpenAI, Anthropic, or Google key to skip that
        cap and for higher quality. Keys are encrypted at rest and never shown
        in full again.
      </Typography>

      <Stack spacing={1} sx={{ mb: 4 }}>
        <Typography variant="subtitle1" component="h2">
          Account
        </Typography>
        {accountEmail ? (
          <Typography variant="body2" color="text.secondary">
            Signed in as {accountEmail}
          </Typography>
        ) : null}
        {googleLinked ? (
          <Alert severity="success">Google account linked.</Alert>
        ) : (
          <Button variant="outlined" href="/api/auth/google/start?intent=link">
            Link Google
          </Button>
        )}
      </Stack>

      <Stack spacing={1} sx={{ mb: 4 }}>
        <Typography variant="subtitle1" component="h2">
          Appearance
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={themeMode}
          onChange={(_e, value: ThemeMode | null) => {
            if (value) setMode(value);
          }}
          aria-label="Color scheme"
        >
          <ToggleButton value="system">System</ToggleButton>
          <ToggleButton value="light">Light</ToggleButton>
          <ToggleButton value="dark">Dark</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {current?.configured ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          Configured: {current.provider} · key ending in ···{current.last4}
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 3 }}>
          No personal API key yet. Generation still works via free platform AI.
        </Alert>
      )}

      <Box component="form" onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {notice ? <Alert severity="success">{notice}</Alert> : null}
          <FormControl fullWidth>
            <InputLabel id="provider-label">Provider</InputLabel>
            <Select
              labelId="provider-label"
              label="Provider"
              value={provider}
              onChange={(ev) => setProvider(ev.target.value)}
            >
              {PROVIDERS.map((p) => (
                <MenuItem key={p.value} value={p.value}>
                  {p.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="API key"
            type="password"
            name="apiKey"
            autoComplete="off"
            value={apiKey}
            onChange={(ev) => setApiKey(ev.target.value)}
            required
            fullWidth
            helperText="Paste a new key to replace the stored one."
          />
          <Button type="submit" variant="contained" disabled={busy || !apiKey}>
            {busy ? "Saving…" : "Save API key"}
          </Button>
          <Typography variant="body2">
            <Link href="/library" underline="hover">
              Back to library
            </Link>
          </Typography>
        </Stack>
      </Box>
    </Container>
  );
}
