import { useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { me } from "../api/client";
import { HOME_BRAND, HOME_PURPOSE, HOME_TAGLINE } from "../home/homeCopy";

/** Public logged-out homepage for Google brand verification (no AppShell). */
export default function HomePage() {
  useEffect(() => {
    document.title = `${HOME_BRAND} · Spaced repetition study`;
    return () => {
      document.title = "Sugarplum";
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        if (!cancelled) window.location.assign("/today");
      } catch {
        // 401 or network: stay on the public homepage.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h3" component="h1" gutterBottom color="primary">
        {HOME_BRAND}
      </Typography>
      <Typography
        variant="h6"
        component="p"
        color="text.secondary"
        sx={{ mb: 3 }}
      >
        {HOME_TAGLINE}
      </Typography>
      <Typography
        variant="body1"
        component="p"
        sx={{ whiteSpace: "pre-wrap", mb: 4 }}
      >
        {HOME_PURPOSE}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 4 }}>
        <Button variant="contained" href="/login" fullWidth>
          Sign in
        </Button>
        <Button variant="outlined" href="/register" fullWidth>
          Create account
        </Button>
      </Stack>
      <Box component="nav" aria-label="Legal">
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <Link href="/privacy" underline="hover">
            Privacy
          </Link>
          <Link href="/terms" underline="hover">
            Terms
          </Link>
          <Link href="/data-deletion" underline="hover">
            Data deletion
          </Link>
        </Stack>
      </Box>
    </Container>
  );
}
