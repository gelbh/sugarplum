import { useEffect, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { LAST_UPDATED } from "../legal/contact";

const LEGAL_NAV = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/data-deletion", label: "Data deletion" },
] as const;

type LegalPageProps = {
  title: string;
  children: ReactNode;
};

function currentPath(): string {
  return window.location.pathname.replace(/\/$/, "") || "/";
}

export default function LegalPage({ title, children }: LegalPageProps) {
  const path = currentPath();

  useEffect(() => {
    document.title = `${title} · Sugarplum`;
    return () => {
      document.title = "Sugarplum";
    };
  }, [title]);

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: "background.default",
        py: { xs: 4, sm: 6 },
      }}
    >
      <Container maxWidth="sm">
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{ mb: 3 }}
        >
          <Box
            component="img"
            src="/logo-sidebar.png"
            alt=""
            sx={{ height: 28, width: "auto", display: "block" }}
          />
          <Typography variant="h6" component="p" sx={{ m: 0 }}>
            <Link href="/" underline="hover" color="inherit">
              Sugarplum
            </Link>
          </Typography>
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2.5, sm: 3 },
            bgcolor: "background.paper",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontWeight: 600, mb: 0.75 }}
          >
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Last updated {LAST_UPDATED}
          </Typography>
          <Box component="article" sx={{ mt: 1 }}>
            {children}
          </Box>
        </Paper>

        <Box
          component="nav"
          aria-label="Legal"
          sx={{
            mt: 3,
            pt: 2,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Stack
            direction="row"
            spacing={0.5}
            flexWrap="wrap"
            useFlexGap
            alignItems="center"
          >
            {LEGAL_NAV.map((item, i) => {
              const active = path === item.href;
              return (
                <Box
                  key={item.href}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  {i > 0 ? (
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.secondary"
                      aria-hidden
                      sx={{ px: 0.25 }}
                    >
                      ·
                    </Typography>
                  ) : null}
                  <Link
                    href={item.href}
                    underline={active ? "none" : "hover"}
                    color={active ? "primary" : "text.secondary"}
                    aria-current={active ? "page" : undefined}
                    sx={{
                      fontSize: "0.875rem",
                      fontWeight: active ? 600 : 500,
                      textUnderlineOffset: 3,
                    }}
                  >
                    {item.label}
                  </Link>
                </Box>
              );
            })}
            <Typography
              component="span"
              variant="body2"
              color="text.secondary"
              aria-hidden
              sx={{ px: 0.25 }}
            >
              ·
            </Typography>
            <Link
              href="/login"
              underline="hover"
              color="text.secondary"
              sx={{
                fontSize: "0.875rem",
                fontWeight: 500,
                textUnderlineOffset: 3,
              }}
            >
              Sign in
            </Link>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
