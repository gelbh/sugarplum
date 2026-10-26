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
import { useTrackedBusy } from "../progress/useTrackedBusy";

type ThemeMode = "system" | "light" | "dark";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
] as const;

export default function SettingsPage() {
  const { mode, setMode } = useColorScheme();
  const [provider, setProvider] = useState<string>("openai");
  const [apiKey, setApiKey] = useState("");
  const [current, setCurrent] = useState<LlmSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedBusy("Loading…", { trackOnMount: true });
  const { busy, begin, end } = useTrackedBusy("Saving…");

  const themeMode: ThemeMode =
    mode === "light" || mode === "dark" || mode === "system" ? mode : "system";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        const settings = await getLlmSettings();
        if (cancelled) return;
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
        Optional. Without a key, Sugarplum uses free platform AI
        (rate-limited). Add your own key for higher quality and limits. Keys
        are encrypted at rest and never shown in full again.
      </Typography>

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
