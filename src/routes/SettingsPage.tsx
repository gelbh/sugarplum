import { useEffect, useMemo, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useColorScheme } from "@mui/material/styles";
import Brightness6Icon from "@mui/icons-material/Brightness6";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import {
  ApiError,
  deleteLlmSettings,
  disconnectCalendar,
  getCalendarStatus,
  getGamification,
  getLlmSettings,
  getStudyPrefs,
  listDueCards,
  logout,
  me,
  patchGamificationSettings,
  putLlmSettings,
  putStudyPrefs,
  type CalendarStatus,
  type GamificationResponse,
  type LlmSettings,
  type StudyPrefs,
} from "../api/client";
import MagnificCredits from "../achievements/MagnificCredits";
import { isGuest } from "../guest/session";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";
import { freeGenFaqBody, freeGenIntroBlurb } from "../settings/freeGenFaq";
import SettingsSectionNav from "../settings/SettingsSectionNav";
import StudyPacingSection from "../settings/StudyPacingSection";
import {
  ZAI_DEFAULT_TEXT_MODEL,
  ZAI_TEXT_MODEL_OPTIONS,
} from "../settings/zaiModels";
import type { EasyDay } from "../study/loadBalance";

const DEFAULT_STUDY_FORM: StudyPrefs = {
  introBudget: 20,
  reviewBudget: 200,
  rFloor: 0.9,
  desiredRetention: 0.9,
  enableFuzz: true,
  enableLoadBalance: true,
  easyDays: [
    "normal",
    "normal",
    "normal",
    "normal",
    "normal",
    "normal",
    "normal",
  ],
};

type ThemeMode = "system" | "light" | "dark";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "zai", label: "Z.ai" },
] as const;

function settingsQueryMessage(): {
  error: string | null;
  notice: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  if (params.get("linked") === "1") {
    return { error: null, notice: "Google account linked." };
  }
  if (params.get("calendar") === "1") {
    return { error: null, notice: "Google Calendar connected." };
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
  if (code === "calendar" || code === "calendar_refresh") {
    return {
      error: "Calendar connection failed. Try again.",
      notice: null,
    };
  }
  return { error: null, notice: null };
}

export default function SettingsPage() {
  const { mode, setMode } = useColorScheme();
  const [provider, setProvider] = useState<string>("openai");
  const [zaiModel, setZaiModel] = useState<string>(ZAI_DEFAULT_TEXT_MODEL);
  const [apiKey, setApiKey] = useState("");
  const [current, setCurrent] = useState<LlmSettings | null>(null);
  const [studyPrefs, setStudyPrefs] = useState<StudyPrefs>(DEFAULT_STUDY_FORM);
  const [introBudgetInput, setIntroBudgetInput] = useState(
    String(DEFAULT_STUDY_FORM.introBudget),
  );
  const [reviewBudgetInput, setReviewBudgetInput] = useState(
    String(DEFAULT_STUDY_FORM.reviewBudget),
  );
  const [desiredRetentionInput, setDesiredRetentionInput] = useState(
    String(DEFAULT_STUDY_FORM.desiredRetention),
  );
  const [enableFuzz, setEnableFuzz] = useState(DEFAULT_STUDY_FORM.enableFuzz);
  const [enableLoadBalance, setEnableLoadBalance] = useState(
    DEFAULT_STUDY_FORM.enableLoadBalance,
  );
  const [easyDays, setEasyDays] = useState(DEFAULT_STUDY_FORM.easyDays);
  const [heldIntroCount, setHeldIntroCount] = useState<number | null>(null);
  const [googleLinked, setGoogleLinked] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(
    null,
  );
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [guest, setGuest] = useState(false);
  const queryMsg = settingsQueryMessage();
  const [error, setError] = useState<string | null>(queryMsg.error);
  const [notice, setNotice] = useState<string | null>(queryMsg.notice);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [studyNotice, setStudyNotice] = useState<string | null>(null);
  const [gamification, setGamification] = useState<GamificationResponse | null>(
    null,
  );
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [boardOptIn, setBoardOptIn] = useState(false);
  const [achieveError, setAchieveError] = useState<string | null>(null);
  const [achieveNotice, setAchieveNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedOp("Loading…", { trackOnMount: true });
  const { busy, begin, end } = useTrackedOp("Saving…");
  const {
    busy: studyBusy,
    begin: beginStudy,
    end: endStudy,
  } = useTrackedOp("Saving study…");
  const {
    busy: achieveBusy,
    begin: beginAchieve,
    end: endAchieve,
  } = useTrackedOp("Saving achievements…");

  const themeMode: ThemeMode =
    mode === "light" || mode === "dark" || mode === "system" ? mode : "system";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await me();
        const guestMode = isGuest();
        const settings = await getLlmSettings();
        const prefs = await getStudyPrefs();
        const gam = guestMode
          ? null
          : await getGamification().catch(() => null);
        const calendar = guestMode
          ? null
          : await getCalendarStatus().catch(() => null);
        const due = guestMode
          ? null
          : await listDueCards().catch(() => null);
        if (cancelled) return;
        setGuest(guestMode);
        setAccountEmail(user.email);
        setGoogleLinked(user.google_linked === true);
        setCalendarStatus(calendar);
        setCurrent(settings);
        if (settings.configured) {
          setProvider(settings.provider);
          if (settings.provider === "zai" && settings.model) {
            setZaiModel(settings.model);
          }
        }
        setStudyPrefs(prefs);
        setIntroBudgetInput(String(prefs.introBudget));
        setReviewBudgetInput(String(prefs.reviewBudget));
        setDesiredRetentionInput(String(prefs.desiredRetention));
        setEnableFuzz(prefs.enableFuzz);
        setEnableLoadBalance(prefs.enableLoadBalance);
        setEasyDays([...prefs.easyDays]);
        if (due && typeof due.meta?.heldIntroCount === "number") {
          setHeldIntroCount(due.meta.heldIntroCount);
        }
        if (gam) {
          setGamification(gam);
          setDisplayNameInput(gam.displayName ?? "");
          setBoardOptIn(gam.boardOptIn);
        }
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

  async function endGuestSession() {
    await logout();
    window.location.assign("/login");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    begin();
    try {
      const saved = await putLlmSettings(
        provider,
        apiKey,
        provider === "zai" ? zaiModel : undefined,
      );
      setCurrent(saved);
      setApiKey("");
      setNotice("API key saved (encrypted at rest).");
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save key");
      end(false);
    }
  }

  async function onRemoveKey() {
    if (
      !window.confirm(
        "Remove the saved API key? New generation will use free platform AI.",
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await deleteLlmSettings();
      setCurrent({ configured: false });
      setApiKey("");
      setNotice("API key removed. Generation will use free platform AI.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove key");
    }
  }

  async function onSubmitAchievements(e: FormEvent) {
    e.preventDefault();
    if (guest) return;
    setAchieveError(null);
    setAchieveNotice(null);
    beginAchieve();
    try {
      const saved = await patchGamificationSettings({
        boardOptIn,
        displayName: displayNameInput.trim() || null,
      });
      setGamification(saved);
      setDisplayNameInput(saved.displayName ?? "");
      setBoardOptIn(saved.boardOptIn);
      setAchieveNotice("Achievement settings saved.");
      endAchieve();
    } catch (err) {
      setAchieveError(
        err instanceof ApiError ? err.message : "Could not save settings",
      );
      endAchieve(false);
    }
  }

  async function onSubmitStudy(e: FormEvent) {
    e.preventDefault();
    setStudyError(null);
    setStudyNotice(null);
    const introBudget = Number(introBudgetInput);
    const reviewBudget = Number(reviewBudgetInput);
    const desiredRetention = Number(desiredRetentionInput);
    if (
      !Number.isFinite(introBudget) ||
      !Number.isFinite(reviewBudget) ||
      !Number.isFinite(desiredRetention) ||
      desiredRetention < 0.7 ||
      desiredRetention > 0.97 ||
      introBudget < 1 ||
      reviewBudget < 1
    ) {
      setStudyError(
        "Enter positive budgets and a retention between 0.70 and 0.97.",
      );
      return;
    }
    beginStudy();
    try {
      const saved = await putStudyPrefs({
        introBudget,
        reviewBudget,
        rFloor: studyPrefs.rFloor,
        desiredRetention,
        enableFuzz,
        enableLoadBalance,
        easyDays,
      });
      setStudyPrefs(saved);
      setIntroBudgetInput(String(saved.introBudget));
      setReviewBudgetInput(String(saved.reviewBudget));
      setDesiredRetentionInput(String(saved.desiredRetention));
      setEnableFuzz(saved.enableFuzz);
      setEnableLoadBalance(saved.enableLoadBalance);
      setEasyDays([...saved.easyDays]);
      setStudyNotice("Study settings saved.");
      endStudy();
    } catch (err) {
      setStudyError(
        err instanceof ApiError ? err.message : "Could not save study prefs",
      );
      endStudy(false);
    }
  }

  const navSections = useMemo(
    () => [
      {
        id: "study",
        label: "Study",
        summary: `${introBudgetInput || "—"} new/day`,
      },
      {
        id: "appearance",
        label: "Appearance",
        summary: themeMode,
      },
      {
        id: "account",
        label: "Account",
        summary: guest ? "guest" : googleLinked ? "Google" : "signed in",
      },
      {
        id: "achievements",
        label: "Achievements",
        summary: gamification
          ? `L${gamification.level}`
          : guest
            ? "sign in"
            : undefined,
      },
      {
        id: "ai",
        label: "AI",
        summary: current?.configured ? "key set" : "free AI",
      },
      { id: "legal", label: "Legal" },
    ],
    [
      introBudgetInput,
      themeMode,
      guest,
      googleLinked,
      gamification,
      current?.configured,
    ],
  );

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 5 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{ color: "text.primary", fontWeight: 600 }}
          >
            Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {freeGenIntroBlurb()}
          </Typography>
          {error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
          {notice ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              {notice}
            </Alert>
          ) : null}
        </Box>

        <SettingsSectionNav sections={navSections} />

        <StudyPacingSection
          guest={guest}
          studyPrefs={studyPrefs}
          introBudgetInput={introBudgetInput}
          reviewBudgetInput={reviewBudgetInput}
          desiredRetentionInput={desiredRetentionInput}
          enableFuzz={enableFuzz}
          enableLoadBalance={enableLoadBalance}
          easyDays={easyDays}
          studyError={studyError}
          studyNotice={studyNotice}
          studyBusy={studyBusy}
          heldIntroCount={heldIntroCount}
          onIntroBudgetInput={setIntroBudgetInput}
          onReviewBudgetInput={setReviewBudgetInput}
          onDesiredRetentionInput={setDesiredRetentionInput}
          onEnableFuzz={setEnableFuzz}
          onEnableLoadBalance={setEnableLoadBalance}
          onEasyDays={(days: EasyDay[]) => setEasyDays(days)}
          onStudyPrefsPatch={setStudyPrefs}
          onSubmitStudy={onSubmitStudy}
        />

        <Paper
          id="appearance"
          variant="outlined"
          sx={{
            p: 2.5,
            bgcolor: "background.paper",
            borderColor: "divider",
            scrollMarginTop: 72,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mb: 1.5 }}
          >
            <Brightness6Icon color="primary" fontSize="small" />
            <Typography
              variant="subtitle1"
              component="h2"
              sx={{ fontWeight: 600, color: "primary.main" }}
            >
              Appearance
            </Typography>
          </Stack>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={themeMode}
            onChange={(_e, value: ThemeMode | null) => {
              if (value) setMode(value);
            }}
            aria-label="Color scheme"
            color="primary"
          >
            <ToggleButton value="system">System</ToggleButton>
            <ToggleButton value="light">Light</ToggleButton>
            <ToggleButton value="dark">Dark</ToggleButton>
          </ToggleButtonGroup>
        </Paper>

        <Paper
          id="account"
          variant="outlined"
          sx={{
            p: 2.5,
            bgcolor: "background.paper",
            borderColor: "divider",
            scrollMarginTop: 72,
          }}
        >
          <Typography
            variant="subtitle1"
            component="h2"
            sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
          >
            Account & connections
          </Typography>
          <Stack spacing={1.5}>
            {guest ? (
              <>
                <Alert severity="info">
                  Guest mode: decks and reviews stay in this browser only.
                </Alert>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => void endGuestSession()}
                >
                  End guest session
                </Button>
                <Button variant="outlined" href="/register">
                  Create account
                </Button>
              </>
            ) : (
              <>
                {accountEmail ? (
                  <Typography variant="body2" color="text.secondary">
                    Signed in as {accountEmail}
                  </Typography>
                ) : null}
                {googleLinked ? (
                  <Alert severity="success">Google account linked.</Alert>
                ) : (
                  <Button
                    variant="outlined"
                    color="primary"
                    href="/api/auth/google/start?intent=link"
                  >
                    Link Google
                  </Button>
                )}
                {calendarStatus?.connected ? (
                  <Stack spacing={1}>
                    <Alert severity="success">
                      Google Calendar connected
                      {calendarStatus.suggestions || calendarStatus.gaps
                        ? ` (${[
                            calendarStatus.suggestions ? "suggestions" : null,
                            calendarStatus.gaps ? "study gaps" : null,
                          ]
                            .filter(Boolean)
                            .join(", ")})`
                        : ""}
                      .
                    </Alert>
                    <Button
                      variant="outlined"
                      color="primary"
                      disabled={calendarBusy}
                      onClick={() => {
                        void (async () => {
                          setCalendarBusy(true);
                          setError(null);
                          try {
                            await disconnectCalendar();
                            setCalendarStatus({
                              connected: false,
                              suggestions: false,
                              gaps: false,
                              reconnect: false,
                            });
                            setNotice("Google Calendar disconnected.");
                          } catch (err) {
                            setError(
                              err instanceof ApiError
                                ? err.message
                                : "Could not disconnect calendar",
                            );
                          } finally {
                            setCalendarBusy(false);
                          }
                        })();
                      }}
                    >
                      Disconnect Google Calendar
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    variant="outlined"
                    color="primary"
                    href="/api/calendar/connect"
                  >
                    {calendarStatus?.reconnect
                      ? "Reconnect Google Calendar"
                      : "Connect Google Calendar"}
                  </Button>
                )}
              </>
            )}
          </Stack>
        </Paper>

        <Paper
          id="achievements"
          variant="outlined"
          sx={{
            p: 2.5,
            bgcolor: "background.paper",
            borderColor: "divider",
            scrollMarginTop: 72,
          }}
        >
          <Typography
            variant="subtitle1"
            component="h2"
            sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
          >
            Achievements
          </Typography>
          {guest ? (
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Sign in to earn fruit medals, streaks, and XP.
              </Typography>
              <Button
                variant="outlined"
                onClick={() => navigate("/achievements")}
              >
                View achievements
              </Button>
              <MagnificCredits />
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                {gamification
                  ? `Streak ${gamification.streakCurrent} · Level ${gamification.level} · ${gamification.xpTotal} XP`
                  : "Track study milestones and optional weekly leaderboard."}
              </Typography>
              <Button
                variant="outlined"
                onClick={() => navigate("/achievements")}
              >
                Open achievement gallery
              </Button>
              <Box component="form" onSubmit={onSubmitAchievements} noValidate>
                <Stack spacing={2}>
                  {achieveError ? (
                    <Alert severity="error">{achieveError}</Alert>
                  ) : null}
                  {achieveNotice ? (
                    <Alert severity="success">{achieveNotice}</Alert>
                  ) : null}
                  <TextField
                    label="Leaderboard display name"
                    value={displayNameInput}
                    onChange={(ev) => setDisplayNameInput(ev.target.value)}
                    fullWidth
                    helperText="Shown on the weekly board when opted in."
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={boardOptIn}
                        onChange={(_e, checked) => setBoardOptIn(checked)}
                        color="primary"
                      />
                    }
                    label="Show me on the weekly XP board"
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={achieveBusy}
                  >
                    {achieveBusy ? "Saving…" : "Save achievement settings"}
                  </Button>
                </Stack>
              </Box>
              <MagnificCredits />
            </Stack>
          )}
        </Paper>

        <Paper
          id="ai"
          variant="outlined"
          sx={{
            p: 2.5,
            bgcolor: "background.paper",
            borderColor: "divider",
            scrollMarginTop: 72,
          }}
        >
          <Typography
            variant="subtitle1"
            component="h2"
            sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
          >
            AI & generations
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {freeGenFaqBody()}
          </Typography>
          {guest ? (
            <Alert severity="info">
              Guest mode cannot save API keys or run AI generation. Create an
              account to upload materials and generate cards.
            </Alert>
          ) : (
            <>
              {current?.configured ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Configured: {current.provider} · key ending in ···
                  {current.last4}
                </Alert>
              ) : (
                <Alert severity="info" sx={{ mb: 2 }}>
                  No personal API key yet. Generation still works via free
                  platform AI.
                </Alert>
              )}

              <Box component="form" onSubmit={onSubmit} noValidate>
                <Stack spacing={2}>
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
                  {provider === "zai" ? (
                    <FormControl fullWidth>
                      <InputLabel id="zai-model-label">Model</InputLabel>
                      <Select
                        labelId="zai-model-label"
                        label="Model"
                        value={zaiModel}
                        onChange={(ev) => setZaiModel(ev.target.value)}
                      >
                        {ZAI_TEXT_MODEL_OPTIONS.map((m) => (
                          <MenuItem key={m.value} value={m.value}>
                            {m.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : null}
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
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={busy || !apiKey}
                  >
                    {busy ? "Saving…" : "Save API key"}
                  </Button>
                  {current?.configured ? (
                    <Button
                      type="button"
                      variant="outlined"
                      onClick={() => void onRemoveKey()}
                    >
                      Remove API key
                    </Button>
                  ) : null}
                </Stack>
              </Box>
            </>
          )}
        </Paper>

        <Paper
          id="legal"
          variant="outlined"
          sx={{
            p: 2.5,
            bgcolor: "background.paper",
            borderColor: "divider",
            scrollMarginTop: 72,
          }}
        >
          <Typography
            variant="subtitle1"
            component="h2"
            sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
          >
            Legal
          </Typography>
          <Typography variant="body2">
            <Link href="/privacy" underline="hover" color="primary">
              Privacy Policy
            </Link>
            {" · "}
            <Link href="/terms" underline="hover" color="primary">
              Terms of Service
            </Link>
            {" · "}
            <Link href="/data-deletion" underline="hover" color="primary">
              Data deletion
            </Link>
          </Typography>
        </Paper>

        <Typography variant="body2">
          <Link href="/library" underline="hover" color="primary">
            Back to library
          </Link>
        </Typography>
      </Stack>
    </Container>
  );
}
