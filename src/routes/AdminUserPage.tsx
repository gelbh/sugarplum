import { useEffect, useState, type ReactNode } from "react";
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
import { navigate } from "../shared/nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";
import { useSession } from "../session/SessionContext";
import { shouldAutoFocusText } from "../shared/lib/autoFocusText";
import {
  formatAdminCount,
  formatAdminDate,
  formatAdminDateShort,
} from "./adminFormat";

const headSx = {
  color: "secondary.main",
  fontWeight: 600,
  fontSize: "0.6875rem",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  borderBottomColor: "divider",
  bgcolor: "background.paper",
  py: 1.25,
  px: 1.25,
  lineHeight: 1.2,
} as const;

const cellSx = {
  py: 1.25,
  px: 1.25,
  borderBottomColor: "divider",
  verticalAlign: "middle",
  fontSize: "0.875rem",
} as const;

const mutedCellSx = {
  ...cellSx,
  color: "text.secondary",
  fontSize: "0.8125rem",
  whiteSpace: "nowrap",
} as const;

const numCellSx = {
  ...cellSx,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  textAlign: "right",
  fontWeight: 500,
} as const;

const chipSx = {
  height: 20,
  fontWeight: 600,
  fontSize: "0.6875rem",
} as const;

const sectionTitleSx = {
  fontFamily: "h6.fontFamily",
  fontWeight: 600,
  letterSpacing: "-0.01em",
} as const;

const paperSx = {
  overflow: "hidden",
  borderColor: "divider",
} as const;

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        px: 1.75,
        py: 1.25,
        minWidth: 108,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        backgroundImage: (t) =>
          t.palette.mode === "dark"
            ? "linear-gradient(160deg, rgba(206,147,216,0.12) 0%, transparent 55%)"
            : "linear-gradient(160deg, rgba(91,44,111,0.08) 0%, transparent 55%)",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          display: "block",
          color: "secondary.main",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          mb: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="h6"
        component="p"
        sx={{
          m: 0,
          fontFamily: "h6.fontFamily",
          fontWeight: 600,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function ProfileField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          color: "secondary.main",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          mb: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: "text.primary",
          fontWeight: 500,
          wordBreak: "break-word",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={paperSx}>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{
          px: 1.75,
          py: 1.25,
          alignItems: "center",
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: (t) =>
            t.palette.mode === "dark"
              ? "rgba(232,216,199,0.04)"
              : "rgba(91,44,111,0.03)",
        }}
      >
        <Typography variant="h6" component="h2" sx={sectionTitleSx}>
          {title}
        </Typography>
        {action ? <Box sx={{ ml: "auto" }}>{action}</Box> : null}
      </Stack>
      <Box sx={{ p: 1.75 }}>{children}</Box>
    </Paper>
  );
}

function DataTable({
  ariaLabel,
  headers,
  empty,
  colSpan,
  children,
}: {
  ariaLabel: string;
  headers: ReactNode;
  empty?: boolean;
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <TableContainer sx={{ mx: -1.75, mb: -1.75, width: "auto" }}>
      <Table size="small" aria-label={ariaLabel}>
        <TableHead>
          <TableRow>{headers}</TableRow>
        </TableHead>
        <TableBody>
          {empty ? (
            <TableRow>
              <TableCell colSpan={colSpan} align="center" sx={cellSx}>
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", py: 2 }}
                >
                  No rows.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            children
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function stripeRowSx(index: number) {
  return {
    bgcolor: (t: { palette: { mode: string } }) =>
      index % 2 === 1
        ? t.palette.mode === "dark"
          ? "rgba(232,216,199,0.03)"
          : "rgba(91,44,111,0.03)"
        : "transparent",
    "&:last-of-type td": { borderBottom: 0 },
  };
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
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
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
      {!ready ? (
        <Typography sx={{ color: "text.secondary" }}>Loading user…</Typography>
      ) : (
        <Stack spacing={2.5}>
          <Box
            sx={{
              pb: 2,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Link
              component="button"
              type="button"
              variant="body2"
              onClick={() => navigate("/admin")}
              sx={{
                mb: 1.25,
                display: "inline-block",
                color: "secondary.main",
                fontWeight: 600,
              }}
            >
              ← Back to Admin
            </Link>
            <Stack
              direction="row"
              spacing={1.25}
              useFlexGap
              sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
              <Typography
                variant="h3"
                component="h1"
                sx={{
                  color: "text.primary",
                  fontWeight: 600,
                  fontFamily: "h6.fontFamily",
                  letterSpacing: "-0.02em",
                }}
              >
                {detail?.email ?? "User"}
              </Typography>
              {detail ? (
                <Stack direction="row" spacing={0.75} useFlexGap>
                  <Chip
                    size="small"
                    label={
                      detail.disabled_at == null ? "Active" : "Disabled"
                    }
                    color={
                      detail.disabled_at == null ? "success" : "default"
                    }
                    variant="outlined"
                    sx={chipSx}
                  />
                  <Chip
                    size="small"
                    label={detail.google_linked ? "Google" : "Password"}
                    color={detail.google_linked ? "secondary" : "default"}
                    variant="outlined"
                    sx={chipSx}
                  />
                </Stack>
              ) : null}
            </Stack>
          </Box>

          {forbidden ? <Alert severity="warning">Forbidden</Alert> : null}
          {notFound ? <Alert severity="warning">User not found</Alert> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {actionError ? <Alert severity="error">{actionError}</Alert> : null}

          {detail ? (
            <>
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ flexWrap: "wrap" }}
              >
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

              <Stack
                direction="row"
                spacing={1.25}
                useFlexGap
                sx={{ flexWrap: "wrap" }}
              >
                <MetricTile
                  label="Decks"
                  value={formatAdminCount(detail.counts.decks)}
                />
                <MetricTile
                  label="Cards"
                  value={formatAdminCount(detail.counts.cards)}
                />
                <MetricTile
                  label="Jobs"
                  value={formatAdminCount(detail.counts.jobs)}
                />
                <MetricTile
                  label="Materials"
                  value={formatAdminCount(detail.counts.materials)}
                />
                <MetricTile
                  label="Tokens all"
                  value={formatAdminCount(detail.usage.tokensAllTime)}
                />
                <MetricTile
                  label="Tokens 30d"
                  value={formatAdminCount(detail.usage.tokens30d)}
                />
                <MetricTile
                  label="Free 30d"
                  value={formatAdminCount(detail.usage.freeJobs30d)}
                />
                <MetricTile
                  label="BYO 30d"
                  value={formatAdminCount(detail.usage.byoJobs30d)}
                />
                {detail.freeGenToday ? (
                  <MetricTile
                    label="Free gen today"
                    value={`${detail.freeGenToday.used}/${detail.freeGenToday.cap}`}
                  />
                ) : null}
              </Stack>

              <Section title="Profile">
                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "1fr 1fr",
                    },
                  }}
                >
                  <ProfileField label="Id" value={detail.id} />
                  <ProfileField
                    label="Created"
                    value={formatAdminDate(detail.created_at)}
                  />
                  <ProfileField
                    label="Auth"
                    value={detail.google_linked ? "Google" : "Password"}
                  />
                  <ProfileField
                    label="Status"
                    value={
                      detail.disabled_at
                        ? `Disabled · ${formatAdminDate(detail.disabled_at)}`
                        : "Active"
                    }
                  />
                </Box>
              </Section>

              {detail.studyPrefs ? (
                <Section title="Study prefs">
                  <Box
                    sx={{
                      display: "grid",
                      gap: 2,
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(3, 1fr)",
                      },
                    }}
                  >
                    <ProfileField
                      label="Intro budget"
                      value={detail.studyPrefs.intro_budget}
                    />
                    <ProfileField
                      label="Review budget"
                      value={detail.studyPrefs.review_budget}
                    />
                    <ProfileField
                      label="R floor"
                      value={detail.studyPrefs.r_floor}
                    />
                  </Box>
                </Section>
              ) : null}

              {detail.subjects && detail.subjects.length > 0 ? (
                <Section title="Subjects">
                  <Stack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    sx={{ flexWrap: "wrap" }}
                  >
                    {detail.subjects.map((s) => (
                      <Chip
                        key={s.id}
                        label={s.title}
                        variant="outlined"
                        size="small"
                        sx={{ borderColor: "divider" }}
                      />
                    ))}
                  </Stack>
                </Section>
              ) : null}

              {detail.decks && detail.decks.length > 0 ? (
                <Section title="Decks">
                  <Stack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    sx={{ flexWrap: "wrap" }}
                  >
                    {detail.decks.map((d) => (
                      <Chip
                        key={d.id}
                        label={d.title}
                        variant="outlined"
                        size="small"
                        sx={{ borderColor: "divider" }}
                      />
                    ))}
                  </Stack>
                </Section>
              ) : null}

              {detail.materials && detail.materials.length > 0 ? (
                <Section title="Materials">
                  <DataTable
                    ariaLabel="User materials"
                    colSpan={4}
                    headers={
                      <>
                        <TableCell sx={headSx}>Kind</TableCell>
                        <TableCell sx={headSx}>Filename</TableCell>
                        <TableCell sx={headSx}>Status</TableCell>
                        <TableCell sx={headSx}>Created</TableCell>
                      </>
                    }
                  >
                    {detail.materials.map((m, index) => (
                      <TableRow key={m.id} sx={stripeRowSx(index)}>
                        <TableCell sx={cellSx}>{m.kind}</TableCell>
                        <TableCell sx={cellSx}>{m.filename ?? "-"}</TableCell>
                        <TableCell sx={cellSx}>{m.status}</TableCell>
                        <TableCell sx={mutedCellSx}>
                          {formatAdminDateShort(m.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </DataTable>
                </Section>
              ) : null}

              {detail.cardSample && detail.cardSample.length > 0 ? (
                <Section title="Card sample">
                  <DataTable
                    ariaLabel="Card sample"
                    colSpan={3}
                    headers={
                      <>
                        <TableCell sx={headSx}>Type</TableCell>
                        <TableCell sx={headSx}>Status</TableCell>
                        <TableCell sx={headSx}>Front</TableCell>
                      </>
                    }
                  >
                    {detail.cardSample.map((card, index) => (
                      <TableRow key={card.id} sx={stripeRowSx(index)}>
                        <TableCell sx={cellSx}>{card.type}</TableCell>
                        <TableCell sx={cellSx}>{card.status}</TableCell>
                        <TableCell
                          sx={{
                            ...cellSx,
                            color: "text.secondary",
                            fontFamily: "ui-monospace, monospace",
                            fontSize: "0.8125rem",
                          }}
                        >
                          {card.frontPreview}
                        </TableCell>
                      </TableRow>
                    ))}
                  </DataTable>
                </Section>
              ) : null}

              <Section title="Recent jobs">
                <DataTable
                  ariaLabel="Recent generation jobs"
                  colSpan={5}
                  empty={detail.recentJobs.length === 0}
                  headers={
                    <>
                      <TableCell sx={headSx}>Id</TableCell>
                      <TableCell sx={headSx}>Status</TableCell>
                      <TableCell sx={headSx}>Path</TableCell>
                      <TableCell sx={{ ...headSx, textAlign: "right" }}>
                        Tokens
                      </TableCell>
                      <TableCell sx={headSx}>Created</TableCell>
                    </>
                  }
                >
                  {detail.recentJobs.map((job, index) => (
                    <TableRow key={job.id} sx={stripeRowSx(index)}>
                      <TableCell
                        sx={{
                          ...cellSx,
                          fontFamily: "ui-monospace, monospace",
                          fontSize: "0.8125rem",
                        }}
                        title={job.id}
                      >
                        {shortId(job.id)}
                      </TableCell>
                      <TableCell sx={cellSx}>{job.status}</TableCell>
                      <TableCell sx={cellSx}>{job.path ?? "-"}</TableCell>
                      <TableCell sx={numCellSx}>
                        {job.tokens_used != null
                          ? formatAdminCount(job.tokens_used)
                          : "-"}
                      </TableCell>
                      <TableCell sx={mutedCellSx}>
                        {formatAdminDateShort(job.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              </Section>

              <Section title="Recent study days">
                <DataTable
                  ariaLabel="Recent study days"
                  colSpan={2}
                  empty={detail.recentStudyDays.length === 0}
                  headers={
                    <>
                      <TableCell sx={headSx}>Day</TableCell>
                      <TableCell sx={{ ...headSx, textAlign: "right" }}>
                        Intros used
                      </TableCell>
                    </>
                  }
                >
                  {detail.recentStudyDays.map((day, index) => (
                    <TableRow key={day.day} sx={stripeRowSx(index)}>
                      <TableCell sx={mutedCellSx}>{day.day}</TableCell>
                      <TableCell sx={numCellSx}>{day.intros_used}</TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              </Section>

              <Typography
                variant="caption"
                sx={{ color: "text.secondary", display: "block" }}
              >
                Export JSON still includes full card and material text.
              </Typography>

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
