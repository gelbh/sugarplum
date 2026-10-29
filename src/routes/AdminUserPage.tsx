import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { adminGetUser, ApiError, type AdminUserDetail } from "../api/client";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";

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
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedOp("Loading user…", {
    trackOnMount: true,
  });

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setDetail(null);
    setForbidden(false);
    setNotFound(false);
    setError(null);
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
          </Box>

          {forbidden ? <Alert severity="warning">Forbidden</Alert> : null}
          {notFound ? <Alert severity="warning">User not found</Alert> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}

          {detail ? (
            <>
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
              </Stack>

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
                        <TableCell>Created</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.recentJobs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center">
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
            </>
          ) : null}
        </Stack>
      )}
    </Container>
  );
}
