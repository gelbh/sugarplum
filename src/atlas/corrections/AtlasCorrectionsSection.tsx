import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { errMessage } from "../mutate/atlasMutateHelpers";
import type { AdminAtlasCorrection } from "../types";
import {
  adminListAtlasCorrections,
  adminResolveAtlasCorrection,
  correctionExportJson,
} from "./apiCorrections";
import { formatDiffValue } from "./correctionCopy";

export default function AtlasCorrectionsSection() {
  const [rows, setRows] = useState<AdminAtlasCorrection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminListAtlasCorrections("open")
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((err) => {
        if (!cancelled) setError(errMessage(err, "Could not load corrections"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function resolve(id: string, status: "accepted" | "rejected") {
    setBusyId(id);
    setError(null);
    try {
      await adminResolveAtlasCorrection(id, status);
      setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev);
    } catch (err) {
      setError(errMessage(err, "Could not update the suggestion"));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (copiedId === null) return;
    const timer = setTimeout(() => setCopiedId(null), 2000);
    return () => clearTimeout(timer);
  }, [copiedId]);

  async function copy(row: AdminAtlasCorrection) {
    try {
      await navigator.clipboard.writeText(correctionExportJson(row));
      setCopiedId(row.id);
    } catch {
      setError("Could not copy to the clipboard");
    }
  }

  return (
    <Box component="section" aria-label="Atlas corrections">
      <Typography variant="h6" component="h2" gutterBottom>
        Atlas corrections
      </Typography>
      {error ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      ) : null}
      {rows === null && !error ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Loading corrections…
        </Typography>
      ) : null}
      {rows !== null && rows.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          No open suggestions.
        </Typography>
      ) : null}
      <Stack spacing={1.5}>
        {(rows ?? []).map((row) => (
          <Paper key={row.id} variant="outlined" sx={{ p: 2 }}>
            <Typography sx={{ fontWeight: 600 }}>
              <Box component="span" sx={{ fontStyle: "italic" }}>
                {row.canonicalName}
              </Box>
              {row.commonName ? ` (${row.commonName})` : ""}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
              {row.studentEmail}, {new Date(row.createdAt).toLocaleString()}
            </Typography>
            <Stack spacing={0.75} sx={{ mb: 1 }}>
              {Object.entries(row.diff).map(([field, change]) => (
                <Box key={field}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {field}
                  </Typography>
                  <Typography variant="body2">
                    From: {formatDiffValue(change.from)}
                  </Typography>
                  <Typography variant="body2">
                    To: {formatDiffValue(change.to)}
                  </Typography>
                </Box>
              ))}
            </Stack>
            {row.note ? (
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Note: {row.note}
              </Typography>
            ) : null}
            {row.sourceUrl ? (
              <Link
                href={row.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
              >
                {row.sourceUrl}
              </Link>
            ) : null}
            <Stack
              direction="row"
              spacing={1}
              sx={{ mt: 1.5, flexWrap: "wrap" }}
            >
              <Button
                size="small"
                variant="contained"
                disabled={busyId === row.id}
                onClick={() => void resolve(row.id, "accepted")}
              >
                Accept
              </Button>
              <Button
                size="small"
                disabled={busyId === row.id}
                onClick={() => void resolve(row.id, "rejected")}
              >
                Reject
              </Button>
              <Button size="small" onClick={() => void copy(row)}>
                {copiedId === row.id ? "Copied" : "Copy as JSON"}
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
