import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
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
  adminListUsers,
  adminOverview,
  ApiError,
  type AdminOverview,
  type AdminUserListItem,
} from "../api/client";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";

const SEARCH_DEBOUNCE_MS = 300;

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

export default function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [search, setSearch] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedOp("Loading admin…", { trackOnMount: true });
  /** Skip the first search effect after mount load already filled the table. */
  const skipSearchAfterMount = useRef(true);
  const searchRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ov, listRes] = await Promise.all([
          adminOverview(),
          adminListUsers(),
        ]);
        if (cancelled) return;
        setOverview(ov);
        setUsers(listRes.users);
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
        setError(
          err instanceof ApiError ? err.message : "Failed to load admin data",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad]);

  useEffect(() => {
    if (!ready || forbidden) return;
    if (skipSearchAfterMount.current) {
      skipSearchAfterMount.current = false;
      return;
    }
    const q = search.trim();
    const requestId = ++searchRequestId.current;
    const timer = window.setTimeout(() => {
      adminListUsers(q)
        .then(({ users: list }) => {
          if (requestId !== searchRequestId.current) return;
          setUsers(list);
          setError(null);
        })
        .catch((err) => {
          if (requestId !== searchRequestId.current) return;
          const auth = handleAdminAuthError(err);
          if (auth === "401") return;
          if (auth === "403") {
            setForbidden(true);
            return;
          }
          setError(
            err instanceof ApiError ? err.message : "Failed to search users",
          );
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [search, ready, forbidden]);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 5 } }}>
      {!ready ? (
        <Typography color="text.secondary">Loading admin…</Typography>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              sx={{ color: "text.primary", fontWeight: 600 }}
            >
              Admin
            </Typography>
          </Box>

          {forbidden ? (
            <Alert severity="warning">Forbidden</Alert>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}

          {!forbidden && overview ? (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`Users: ${overview.userCount}`} variant="outlined" />
              <Chip
                label={`New (7d): ${overview.createdLast7d}`}
                variant="outlined"
              />
            </Stack>
          ) : null}

          {!forbidden ? (
            <>
              <TextField
                label="Search email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                fullWidth
                size="small"
                autoComplete="off"
              />

              <TableContainer component={Paper} variant="outlined">
                <Table size="small" aria-label="Users">
                  <TableHead>
                    <TableRow>
                      <TableCell>Email</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell align="center">Google</TableCell>
                      <TableCell align="right">Decks</TableCell>
                      <TableCell align="right">Cards</TableCell>
                      <TableCell align="right">Jobs</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ py: 2 }}
                          >
                            No users match this search.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user) => (
                        <TableRow
                          key={user.id}
                          hover
                          sx={{ cursor: "pointer" }}
                          onClick={() =>
                            navigate(
                              `/admin/users/${encodeURIComponent(user.id)}`,
                            )
                          }
                        >
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{formatCreated(user.created_at)}</TableCell>
                          <TableCell align="center">
                            {user.google_linked ? "Yes" : "No"}
                          </TableCell>
                          <TableCell align="right">{user.deckCount}</TableCell>
                          <TableCell align="right">{user.cardCount}</TableCell>
                          <TableCell align="right">{user.jobCount}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : null}
        </Stack>
      )}
    </Container>
  );
}
