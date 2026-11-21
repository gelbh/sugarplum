import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import SearchIcon from "@mui/icons-material/Search";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  adminListUsers,
  adminOverview,
  ApiError,
  type AdminListUsersOpts,
  type AdminOverview,
  type AdminUserListItem,
} from "../api/client";
import { navigate } from "../shared/nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";
import {
  formatAdminCount,
  formatAdminDateShort,
} from "./adminFormat";

const SEARCH_DEBOUNCE_MS = 300;

type SortKey = NonNullable<AdminListUsersOpts["sort"]>;
type StatusFilter = NonNullable<AdminListUsersOpts["status"]>;
type GoogleFilter = NonNullable<AdminListUsersOpts["google"]>;
type SortDir = NonNullable<AdminListUsersOpts["dir"]>;

function handleAdminAuthError(err: unknown): "401" | "403" | "other" {
  if (!(err instanceof ApiError)) return "other";
  if (err.status === 401) {
    window.location.assign("/login");
    return "401";
  }
  if (err.status === 403) return "403";
  return "other";
}

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

// Opaque paper + wash overlay so scrolled cells never bleed through sticky.
const stickyUserHeadSx = {
  ...headSx,
  minWidth: 240,
  position: "sticky",
  left: 0,
  zIndex: 3,
  bgcolor: "background.paper",
  backgroundImage: "none",
  borderRight: "1px solid",
  borderRightColor: "divider",
} as const;

const cellSx = {
  py: 1.25,
  px: 1.25,
  borderBottomColor: "divider",
  verticalAlign: "middle",
} as const;

const stickyUserCellSx = {
  ...cellSx,
  minWidth: 240,
  position: "sticky",
  left: 0,
  zIndex: 2,
  bgcolor: "background.paper",
  backgroundImage: "none",
  borderRight: "1px solid",
  borderRightColor: "divider",
} as const;

const numHeadSx = {
  ...headSx,
  textAlign: "right",
} as const;

const numCellSx = {
  ...cellSx,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  textAlign: "right",
  fontWeight: 500,
  fontSize: "0.875rem",
} as const;

const chipSx = {
  height: 20,
  fontWeight: 600,
  fontSize: "0.6875rem",
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

function NumSortLabel({
  active,
  direction,
  onClick,
  children,
}: {
  active: boolean;
  direction: SortDir;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <TableSortLabel
      active={active}
      direction={direction}
      onClick={onClick}
      sx={{
        flexDirection: "row-reverse",
        justifyContent: "flex-start",
        "& .MuiTableSortLabel-icon": { ml: 0, mr: 0.5 },
      }}
    >
      {children}
    </TableSortLabel>
  );
}

export default function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [google, setGoogle] = useState<GoogleFilter>("all");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [dir, setDir] = useState<SortDir>("desc");
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedOp("Loading admin…", { trackOnMount: true });
  const skipSearchAfterMount = useRef(true);
  const listRequestId = useRef(0);

  function listOpts(overrides?: Partial<AdminListUsersOpts>): AdminListUsersOpts {
    return {
      q: search,
      status,
      google,
      sort,
      dir,
      ...overrides,
    };
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ov, listRes] = await Promise.all([
          adminOverview(),
          adminListUsers(listOpts()),
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
    // Mount-only load; subsequent filter changes use the search effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endLoad]);

  useEffect(() => {
    if (!ready || forbidden) return;
    if (skipSearchAfterMount.current) {
      skipSearchAfterMount.current = false;
      return;
    }
    const requestId = ++listRequestId.current;
    const timer = window.setTimeout(() => {
      adminListUsers(listOpts())
        .then(({ users: list }) => {
          if (requestId !== listRequestId.current) return;
          setUsers(list);
          setError(null);
        })
        .catch((err) => {
          if (requestId !== listRequestId.current) return;
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
    // listOpts closes over search/status/google/sort/dir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, google, sort, dir, ready, forbidden]);

  function onSort(next: SortKey) {
    if (sort === next) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(next);
    setDir(next === "email" ? "asc" : "desc");
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      {!ready ? (
        <Typography sx={{ color: "text.secondary" }}>Loading admin…</Typography>
      ) : (
        <Stack spacing={2.5}>
          <Box
            sx={{
              pb: 2,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
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
              Admin
            </Typography>
          </Box>

          {forbidden ? (
            <Alert severity="warning">Forbidden</Alert>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}

          {!forbidden && overview ? (
            <Stack
              direction="row"
              spacing={1.25}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
            >
              <MetricTile
                label="Users"
                value={formatAdminCount(overview.userCount)}
              />
              <MetricTile
                label="New 7d"
                value={formatAdminCount(overview.createdLast7d)}
              />
              <MetricTile
                label="Tokens 30d"
                value={formatAdminCount(overview.tokens30d ?? 0)}
              />
              <MetricTile
                label="Free jobs"
                value={formatAdminCount(overview.freeJobs30d ?? 0)}
              />
              <MetricTile
                label="BYO jobs"
                value={formatAdminCount(overview.byoJobs30d ?? 0)}
              />
            </Stack>
          ) : null}

          {!forbidden ? (
            <Paper
              variant="outlined"
              sx={{
                overflow: "hidden",
                borderColor: "divider",
              }}
            >
              <Stack
                direction="row"
                spacing={1.25}
                useFlexGap
                sx={{
                  p: 1.25,
                  alignItems: "center",
                  flexWrap: "wrap",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  bgcolor: (t) =>
                    t.palette.mode === "dark"
                      ? "rgba(232,216,199,0.04)"
                      : "rgba(91,44,111,0.03)",
                }}
              >
                <TextField
                  placeholder="Search email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  size="small"
                  autoComplete="off"
                  sx={{ width: { xs: "100%", sm: 280 }, flexShrink: 0 }}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon
                            fontSize="small"
                            sx={{ color: "text.secondary" }}
                          />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel id="admin-status-label">Status</InputLabel>
                  <Select
                    labelId="admin-status-label"
                    label="Status"
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as StatusFilter)
                    }
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="disabled">Disabled</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel id="admin-google-label">Google</InputLabel>
                  <Select
                    labelId="admin-google-label"
                    label="Google"
                    value={google}
                    onChange={(e) =>
                      setGoogle(e.target.value as GoogleFilter)
                    }
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="yes">Yes</MenuItem>
                    <MenuItem value="no">No</MenuItem>
                  </Select>
                </FormControl>
                <Chip
                  size="small"
                  label={`${users.length} shown`}
                  variant="outlined"
                  sx={{
                    ml: { sm: "auto" },
                    height: 28,
                    fontVariantNumeric: "tabular-nums",
                    borderColor: "divider",
                    color: "text.secondary",
                  }}
                />
              </Stack>

              <TableContainer
                sx={{
                  maxHeight: { md: "70vh" },
                  overflowX: "auto",
                  "&::-webkit-scrollbar": { height: 8 },
                  "&::-webkit-scrollbar-thumb": {
                    bgcolor: "divider",
                    borderRadius: 4,
                  },
                }}
              >
                <Table
                  aria-label="Users"
                  stickyHeader
                  size="small"
                  sx={{
                    minWidth: 980,
                    width: "100%",
                    tableLayout: "auto",
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell sx={stickyUserHeadSx}>
                        <TableSortLabel
                          active={sort === "email"}
                          direction={sort === "email" ? dir : "asc"}
                          onClick={() => onSort("email")}
                        >
                          User
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ ...headSx, minWidth: 108 }}>
                        <TableSortLabel
                          active={sort === "created_at"}
                          direction={sort === "created_at" ? dir : "desc"}
                          onClick={() => onSort("created_at")}
                        >
                          Created
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ ...headSx, minWidth: 108 }}>
                        <TableSortLabel
                          active={sort === "last_activity"}
                          direction={sort === "last_activity" ? dir : "desc"}
                          onClick={() => onSort("last_activity")}
                        >
                          Active
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ ...numHeadSx, minWidth: 68 }}>
                        <NumSortLabel
                          active={sort === "decks"}
                          direction={sort === "decks" ? dir : "desc"}
                          onClick={() => onSort("decks")}
                        >
                          Decks
                        </NumSortLabel>
                      </TableCell>
                      <TableCell sx={{ ...numHeadSx, minWidth: 68 }}>
                        Cards
                      </TableCell>
                      <TableCell sx={{ ...numHeadSx, minWidth: 60 }}>
                        Jobs
                      </TableCell>
                      <TableCell sx={{ ...numHeadSx, minWidth: 60 }}>
                        Mats
                      </TableCell>
                      <TableCell sx={{ ...numHeadSx, minWidth: 88 }}>
                        <NumSortLabel
                          active={sort === "tokens_30d"}
                          direction={sort === "tokens_30d" ? dir : "desc"}
                          onClick={() => onSort("tokens_30d")}
                        >
                          Tok 30d
                        </NumSortLabel>
                      </TableCell>
                      <TableCell sx={{ ...numHeadSx, minWidth: 76 }}>
                        Tok all
                      </TableCell>
                      <TableCell sx={{ ...numHeadSx, minWidth: 60 }}>
                        Free
                      </TableCell>
                      <TableCell sx={{ ...numHeadSx, minWidth: 60 }}>
                        BYO
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} align="center" sx={cellSx}>
                          <Typography
                            variant="body2"
                            sx={{ color: "text.secondary", py: 3 }}
                          >
                            No users match this search.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user, index) => (
                        <TableRow
                          key={user.id}
                          hover
                          sx={{
                            cursor: "pointer",
                            bgcolor: (t) =>
                              index % 2 === 1
                                ? t.palette.mode === "dark"
                                  ? "rgba(232,216,199,0.03)"
                                  : "rgba(91,44,111,0.03)"
                                : "transparent",
                            "&:last-of-type td": { borderBottom: 0 },
                            "&:hover td": {
                              bgcolor: (t) =>
                                t.palette.mode === "dark"
                                  ? "rgba(206,147,216,0.1)"
                                  : "rgba(91,44,111,0.07)",
                            },
                            "& td:first-of-type": {
                              bgcolor: "background.paper",
                              backgroundImage:
                                index % 2 === 1
                                  ? (t) =>
                                      t.palette.mode === "dark"
                                        ? "linear-gradient(rgba(232,216,199,0.03), rgba(232,216,199,0.03))"
                                        : "linear-gradient(rgba(91,44,111,0.03), rgba(91,44,111,0.03))"
                                  : "none",
                            },
                            "&:hover td:first-of-type": {
                              bgcolor: "background.paper",
                              backgroundImage: (t) =>
                                t.palette.mode === "dark"
                                  ? "linear-gradient(rgba(206,147,216,0.1), rgba(206,147,216,0.1))"
                                  : "linear-gradient(rgba(91,44,111,0.07), rgba(91,44,111,0.07))",
                            },
                          }}
                          onClick={() =>
                            navigate(
                              `/admin/users/${encodeURIComponent(user.id)}`,
                            )
                          }
                        >
                          <TableCell sx={stickyUserCellSx}>
                            <Stack
                              direction="row"
                              spacing={1}
                              useFlexGap
                              sx={{
                                alignItems: "center",
                                flexWrap: "nowrap",
                                minWidth: 0,
                              }}
                            >
                              <Typography
                                sx={{
                                  fontWeight: 600,
                                  fontSize: "0.875rem",
                                  lineHeight: 1.3,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  minWidth: 0,
                                  flex: "1 1 auto",
                                }}
                              >
                                {user.email}
                              </Typography>
                              <Stack
                                direction="row"
                                spacing={0.75}
                                useFlexGap
                                sx={{ flexShrink: 0 }}
                              >
                                <Chip
                                  size="small"
                                  label={
                                    user.disabled_at == null
                                      ? "Active"
                                      : "Disabled"
                                  }
                                  color={
                                    user.disabled_at == null
                                      ? "success"
                                      : "default"
                                  }
                                  variant="outlined"
                                  sx={chipSx}
                                />
                                <Chip
                                  size="small"
                                  label={
                                    user.google_linked ? "Google" : "Password"
                                  }
                                  color={
                                    user.google_linked
                                      ? "secondary"
                                      : "default"
                                  }
                                  variant="outlined"
                                  sx={chipSx}
                                />
                              </Stack>
                            </Stack>
                          </TableCell>
                          <TableCell
                            sx={{
                              ...cellSx,
                              color: "text.secondary",
                              fontSize: "0.8125rem",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatAdminDateShort(user.created_at)}
                          </TableCell>
                          <TableCell
                            sx={{
                              ...cellSx,
                              color: "text.secondary",
                              fontSize: "0.8125rem",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatAdminDateShort(user.last_activity_at)}
                          </TableCell>
                          <TableCell sx={numCellSx}>
                            {formatAdminCount(user.decks)}
                          </TableCell>
                          <TableCell sx={numCellSx}>
                            {formatAdminCount(user.cards)}
                          </TableCell>
                          <TableCell sx={numCellSx}>
                            {formatAdminCount(user.jobs)}
                          </TableCell>
                          <TableCell sx={numCellSx}>
                            {formatAdminCount(user.materials)}
                          </TableCell>
                          <TableCell sx={numCellSx}>
                            {formatAdminCount(user.tokens30d)}
                          </TableCell>
                          <TableCell sx={numCellSx}>
                            {formatAdminCount(user.tokensAllTime)}
                          </TableCell>
                          <TableCell sx={numCellSx}>
                            {formatAdminCount(user.freeJobs30d)}
                          </TableCell>
                          <TableCell sx={numCellSx}>
                            {formatAdminCount(user.byoJobs30d)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          ) : null}
        </Stack>
      )}
    </Container>
  );
}
