import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  adminDisableUser,
  adminEnableUser,
  adminExportUser,
  adminGetUser,
  adminImpersonateUser,
  adminWipeUser,
  ApiError,
  type AdminUserDetail,
} from "../api/client";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";
import { useSession } from "../session/SessionContext";
import { shouldAutoFocusText } from "../lib/autoFocusText";

const RETENTION_NOTE =
  "No automatic deletion; wipe inactive accounts manually.";

function formatCreated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function handleAdminAuthError(err: unknown): "401" | "403" | "other" {
  if (!(err instanceof ApiError)) return "other";
  if (err.status === 401) {
    window.location.assign("/login");
    return "401";
  }
  if (err.status === 403) return "403";
  return "other";
}

type Props = { userId: string };

export default function AdminUserPage({ userId }: Props) {
  const { user, refreshSession } = useSession();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeEmail, setWipeEmail] = useState("");
  const [wipeBusy, setWipeBusy] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const { end: endLoad } = useTrackedOp("Loading user…", {
    trackOnMount: true,
  });

  async function refreshDetail() {
    const data = await adminGetUser(userId);
    setDetail(data);
  }

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setDetail(null);
    setForbidden(false);
    setNotFound(false);
    setError(null);
    setActionError(null);
    (async () => {
      try {
        const data = await adminGetUser(userId);
        if (cancelled) return;
        setDetail(data);
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        const auth = handleAdminAuthError(err);
        if (auth === "401") {
          endLoad(false);
          return;
        }
        if (auth === "403") {
          setForbidden(true);
          setReady(true);
          endLoad(false);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          setReady(true);
          endLoad(false);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load user");
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, endLoad]);

  async function onToggleDisabled() {
    if (!detail || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (detail.disabled_at == null) {
        await adminDisableUser(detail.id);
      } else {
        await adminEnableUser(detail.id);
      }
      await refreshDetail();
    } catch (err) {
      const auth = handleAdminAuthError(err);
      if (auth === "401") return;
      if (auth === "403") {
        setForbidden(true);
        return;
      }
      setActionError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function onExport() {
    if (!detail || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await adminExportUser(detail.id);
    } catch (err) {
      const auth = handleAdminAuthError(err);
      if (auth === "401") return;
      if (auth === "403") {
        setForbidden(true);
        return;
      }
      setActionError(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function onViewAs() {
    if (!detail || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await adminImpersonateUser(detail.id);
      await refreshSession();
      navigate("/");
    } catch (err) {
      const auth = handleAdminAuthError(err);
      if (auth === "401") return;
      if (auth === "403") {
        setForbidden(true);
        return;
      }
      setActionError(
        err instanceof ApiError ? err.message : "View as user failed",
      );
    } finally {
      setActionBusy(false);
    }
  }

  function openWipe() {
    setWipeEmail("");
    setWipeError(null);
    setWipeOpen(true);
  }

  async function onWipeConfirm() {
    if (!detail || wipeBusy) return;
    setWipeBusy(true);
    setWipeError(null);
    try {
      await adminWipeUser(detail.id, wipeEmail.trim());
      setWipeOpen(false);
      navigate("/admin");
    } catch (err) {
      const auth = handleAdminAuthError(err);
      if (auth === "401") return;
      if (auth === "403") {
        setWipeOpen(false);
        setForbidden(true);
        return;
      }
      setWipeError(err instanceof ApiError ? err.message : "Wipe failed");
    } finally {
      setWipeBusy(false);
    }
  }

  const wipeEmailMatches =
    detail != null &&
    wipeEmail.trim().toLowerCase() === detail.email.toLowerCase();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 5 } }}>
      {!ready ? (
        <Typography color="text.secondary">Loading user…</Typography>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Link
              component="button"
              type="button"
              variant="body2"
              onClick={() => navigate("/admin")}
              sx={{ mb: 1, display: "inline-block" }}
            >
              ← Back to Admin
            </Link>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              sx={{ color: "text.primary", fontWeight: 600 }}
            >
              {detail?.email ?? "User"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {RETENTION_NOTE}
            </Typography>
          </Box>

          {forbidden ? <Alert severity="warning">Forbidden</Alert> : null}
          {notFound ? <Alert severity="warning">User not found</Alert> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {actionError ? <Alert severity="error">{actionError}</Alert> : null}

          {detail ? (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  variant="contained"
                  disabled={actionBusy || detail.id === user?.id}
                  onClick={onViewAs}
                >
                  View as user
                </Button>
                {detail.disabled_at == null ? (
                  <Button
                    variant="outlined"
                    disabled={actionBusy}
                    onClick={onToggleDisabled}
                  >
                    Disable
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    disabled={actionBusy}
                    onClick={onToggleDisabled}
                  >
                    Enable
                  </Button>
                )}
                <Button
                  variant="outlined"
                  disabled={actionBusy}
                  onClick={onExport}
                >
                  Export
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  disabled={actionBusy}
                  onClick={openWipe}
                >
                  Wipe
                </Button>
              </Stack>

              <Stack spacing={1}>
                <Typography variant="h6" component="h2">
                  Profile
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Id: {detail.id}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Created: {formatCreated(detail.created_at)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Google linked: {detail.google_linked ? "Yes" : "No"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Disabled:{" "}
                  {detail.disabled_at
                    ? formatCreated(detail.disabled_at)
                    : "No"}
                </Typography>
              </Stack>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  label={`Decks: ${detail.counts.decks}`}
                  variant="outlined"
                />
                <Chip
                  label={`Cards: ${detail.counts.cards}`}
                  variant="outlined"
                />
                <Chip
                  label={`Jobs: ${detail.counts.jobs}`}
                  variant="outlined"
                />
                <Chip
                  label={`Materials: ${detail.counts.materials}`}
                  variant="outlined"
                />
                {detail.usage ? (
                  <>
                    <Chip
                      label={`Tokens (all): ${detail.usage.tokensAllTime}`}
                      variant="outlined"
                    />
                    <Chip
                      label={`Tokens (30d): ${detail.usage.tokens30d}`}
                      variant="outlined"
                    />
                    <Chip
                      label={`Free (30d): ${detail.usage.freeJobs30d}`}
                      variant="outlined"
                    />
                    <Chip
                      label={`BYO (30d): ${detail.usage.byoJobs30d}`}
                      variant="outlined"
                    />
                  </>
                ) : null}
                {detail.freeGenToday ? (
                  <Chip
                    label={`Free gen today: ${detail.freeGenToday.used}/${detail.freeGenToday.cap}`}
                    variant="outlined"
                  />
                ) : null}
              </Stack>

              <Typography variant="body2" color="text.secondary">
                Export JSON still has full card and material text.
              </Typography>

              {detail.studyPrefs ? (
                <Stack spacing={1}>
                  <Typography variant="h6" component="h2">
                    Study prefs
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Intro budget: {detail.studyPrefs.intro_budget}; review:{" "}
                    {detail.studyPrefs.review_budget}; r_floor:{" "}
                    {detail.studyPrefs.r_floor}
                  </Typography>
                </Stack>
              ) : null}

              {detail.subjects && detail.subjects.length > 0 ? (
                <Stack spacing={1}>
                  <Typography variant="h6" component="h2">
                    Subjects
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {detail.subjects.map((s) => s.title).join(", ")}
                  </Typography>
                </Stack>
              ) : null}

              {detail.decks && detail.decks.length > 0 ? (
                <Stack spacing={1}>
                  <Typography variant="h6" component="h2">
                    Decks
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {detail.decks.map((d) => d.title).join(", ")}
                  </Typography>
                </Stack>
              ) : null}

              {detail.materials && detail.materials.length > 0 ? (
                <Stack spacing={1}>
                  <Typography variant="h6" component="h2">
                    Materials
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small" aria-label="User materials">
                      <TableHead>
                        <TableRow>
                          <TableCell>Kind</TableCell>
                          <TableCell>Filename</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Created</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detail.materials.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell>{m.kind}</TableCell>
                            <TableCell>{m.filename ?? "-"}</TableCell>
                            <TableCell>{m.status}</TableCell>
                            <TableCell>{formatCreated(m.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              ) : null}

              {detail.cardSample && detail.cardSample.length > 0 ? (
                <Stack spacing={1}>
                  <Typography variant="h6" component="h2">
                    Card sample
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small" aria-label="Card sample">
                      <TableHead>
                        <TableRow>
                          <TableCell>Type</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Front</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detail.cardSample.map((card) => (
                          <TableRow key={card.id}>
                            <TableCell>{card.type}</TableCell>
                            <TableCell>{card.status}</TableCell>
                            <TableCell>{card.frontPreview}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              ) : null}

              <Stack spacing={1}>
                <Typography variant="h6" component="h2">
                  Recent jobs
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small" aria-label="Recent generation jobs">
                    <TableHead>
                      <TableRow>
                        <TableCell>Id</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Path</TableCell>
                        <TableCell align="right">Tokens</TableCell>
                        <TableCell>Created</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.recentJobs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} align="center">
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ py: 2 }}
                            >
                              No generation jobs.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        detail.recentJobs.map((job) => (
                          <TableRow key={job.id}>
                            <TableCell>{job.id}</TableCell>
                            <TableCell>{job.status}</TableCell>
                            <TableCell>{job.path ?? "-"}</TableCell>
                            <TableCell align="right">
                              {job.tokens_used ?? "-"}
                            </TableCell>
                            <TableCell>
                              {formatCreated(job.created_at)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>

              <Stack spacing={1}>
                <Typography variant="h6" component="h2">
                  Recent study days
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small" aria-label="Recent study days">
                    <TableHead>
                      <TableRow>
                        <TableCell>Day</TableCell>
                        <TableCell align="right">Intros used</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.recentStudyDays.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} align="center">
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ py: 2 }}
                            >
                              No study day rows.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        detail.recentStudyDays.map((day) => (
                          <TableRow key={day.day}>
                            <TableCell>{day.day}</TableCell>
                            <TableCell align="right">
                              {day.intros_used}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>

              <Dialog
                open={wipeOpen}
                onClose={() => !wipeBusy && setWipeOpen(false)}
              >
                <DialogTitle>Wipe user?</DialogTitle>
                <DialogContent>
                  <DialogContentText sx={{ mb: 2 }}>
                    This permanently deletes {detail.email} and all their data.
                    Type the email to confirm.
                  </DialogContentText>
                  <TextField
                    label="Confirm email"
                    value={wipeEmail}
                    onChange={(e) => setWipeEmail(e.target.value)}
                    fullWidth
                    size="small"
                    autoComplete="off"
                    disabled={wipeBusy}
                    autoFocus={shouldAutoFocusText()}
                  />
                  {wipeError ? (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      {wipeError}
                    </Alert>
                  ) : null}
                </DialogContent>
                <DialogActions>
                  <Button
                    onClick={() => setWipeOpen(false)}
                    disabled={wipeBusy}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="error"
                    variant="contained"
                    disabled={wipeBusy || !wipeEmailMatches}
                    onClick={onWipeConfirm}
                  >
                    {wipeBusy ? "Wiping…" : "Wipe"}
                  </Button>
                </DialogActions>
              </Dialog>
            </>
          ) : null}
        </Stack>
      )}
    </Container>
  );
}
