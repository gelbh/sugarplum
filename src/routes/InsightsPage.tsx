import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  listStrugglingCards,
  type StrugglingRow,
} from "../api/client";
import StrugglingList from "../components/StrugglingList";
import { useTrackedOp } from "../progress/useTrackedOp";

/** Full ranked struggling list (API or guest local review logs). */
export default function InsightsPage() {
  const [rows, setRows] = useState<StrugglingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedOp("Loading insights…", {
    trackOnMount: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listStrugglingCards();
        if (cancelled) return;
        setRows(list);
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Failed to load insights",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad]);

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 5 } }}>
      {!ready ? (
        <Typography color="text.secondary">Loading insights…</Typography>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              sx={{ color: "text.primary", fontWeight: 600 }}
            >
              Insights
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Cards that recently felt hard (No Idea or Tough Cookie) or are at
              risk of slipping.
            </Typography>
          </Box>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {!error ? <StrugglingList rows={rows} /> : null}
        </Stack>
      )}
    </Container>
  );
}
