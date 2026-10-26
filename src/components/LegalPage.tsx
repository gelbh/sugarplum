import { useEffect, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { LAST_UPDATED } from "../legal/contact";

type LegalPageProps = {
  title: string;
  children: ReactNode;
};

export default function LegalPage({ title, children }: LegalPageProps) {
  useEffect(() => {
    document.title = `${title} · Sugarplum`;
    return () => {
      document.title = "Sugarplum";
    };
  }, [title]);

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography variant="h5" component="p" color="primary" sx={{ mb: 1 }}>
        <Link href="/" underline="hover" color="inherit">
          Sugarplum
        </Link>
      </Typography>
      <Typography variant="h4" component="h1" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Last updated: {LAST_UPDATED}
      </Typography>
      <Box component="article">{children}</Box>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 6 }}>
        <Link href="/privacy" underline="hover">
          Privacy
        </Link>
        <Link href="/terms" underline="hover">
          Terms
        </Link>
        <Link href="/data-deletion" underline="hover">
          Data deletion
        </Link>
        <Link href="/login" underline="hover">
          Sign in
        </Link>
      </Stack>
    </Container>
  );
}

