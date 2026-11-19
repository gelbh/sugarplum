import { useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import PublicNightShell from "../app/PublicNightShell";
import { continueAsGuest } from "../guest/enterGuest";
import HomeFoyerCardPreview from "../home/HomeFoyerCardPreview";
import { HOME_BRAND, HOME_PURPOSE, HOME_TAGLINE } from "../home/homeCopy";

/** Public logged-out homepage for Google brand verification (no AppShell). */
export default function HomePage() {
  useEffect(() => {
    document.title = `${HOME_BRAND} · Spaced repetition study`;
    return () => {
      document.title = "Sugarplum";
    };
  }, []);

  return (
    <PublicNightShell maxWidth="sm" brandMode="heading">
      <Stack
        spacing={3}
        sx={{
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <Typography
          variant="h6"
          component="p"
          sx={{
            color: "text.secondary",
            m: 0,
            fontFamily: "inherit",
            fontWeight: 400,
            maxWidth: "36rem",
          }}
        >
          {HOME_TAGLINE}
        </Typography>

        <HomeFoyerCardPreview />

        <Typography
          variant="body2"
          component="p"
          sx={{
            color: "text.secondary",
            whiteSpace: "pre-wrap",
            m: 0,
            maxWidth: "36rem",
            textAlign: "center",
          }}
        >
          {HOME_PURPOSE}
        </Typography>

        <Stack
          spacing={1.5}
          sx={{ width: "100%", maxWidth: "14rem", mx: "auto" }}
        >
          <Stack spacing={2}>
            <Button variant="contained" href="/login" fullWidth>
              Sign in
            </Button>
            <Button variant="outlined" href="/register" fullWidth>
              Create account
            </Button>
          </Stack>
          <Button variant="text" onClick={() => continueAsGuest()}>
            Continue as guest
          </Button>
        </Stack>

        <Box component="nav" aria-label="Legal">
          <Stack
            direction="row"
            spacing={2}
            useFlexGap
            sx={{
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link href="/privacy" underline="hover" color="primary">
              Privacy
            </Link>
            <Link href="/terms" underline="hover" color="primary">
              Terms
            </Link>
            <Link href="/data-deletion" underline="hover" color="primary">
              Data deletion
            </Link>
          </Stack>
        </Box>
      </Stack>
    </PublicNightShell>
  );
}
