import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ApiError } from "../api/client";
import { ensureAtlas } from "../atlas/apiSource";
import { atlasHref, atlasHubHref } from "../atlas/paths";
import { isGuest } from "../guest/session";
import { navigate, navigateReplace } from "../nav/navigate";

export default function ParasitologyAtlasBounce({
  onBack,
}: {
  onBack?: () => void;
} = {}) {
  const [error, setError] = useState<string | null>(null);
  const guest = isGuest();

  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    navigate(atlasHubHref());
  };

  useEffect(() => {
    if (guest) return;
    let cancelled = false;
    (async () => {
      try {
        const meta = await ensureAtlas();
        if (!cancelled) navigateReplace(atlasHref(meta.id));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Could not open the Atlas",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guest]);

  if (guest) {
    return (
      <Box sx={{ maxWidth: 480, mx: "auto", px: 2, py: 4 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 600 }}>
            Parasitology Atlas
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
            Sign in to open your Parasitology Atlas.
          </Typography>
          <Button variant="contained" href="/login">
            Sign in
          </Button>
        </Paper>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 560, mx: "auto", px: 2, py: 4 }}>
        <Stack spacing={2}>
          <Alert severity="error">{error}</Alert>
          <Button variant="outlined" onClick={goBack}>
            Back to Atlas
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ px: 2, py: 4 }}>
      <Typography color="text.secondary">
        Opening Parasitology Atlas…
      </Typography>
    </Box>
  );
}
