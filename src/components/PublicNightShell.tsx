import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { HOME_BRAND } from "../home/homeCopy";

type PublicNightShellProps = {
  children: ReactNode;
  maxWidth?: "xs" | "sm";
};

/** Shared night foyer chrome for logged-out auth and legal pages. */
export default function PublicNightShell({
  children,
  maxWidth = "sm",
}: PublicNightShellProps) {
  return (
    <Box
      data-dark=""
      sx={{
        minHeight: "100dvh",
        bgcolor: "background.default",
        color: "text.primary",
        display: "flex",
        alignItems: "center",
        py: { xs: 4, sm: 6 },
        backgroundImage: (t) =>
          `radial-gradient(ellipse 80% 50% at 50% 0%, ${t.palette.primary.main}14, transparent 70%)`,
      }}
    >
      <Container maxWidth={maxWidth}>
        <Stack spacing={3} alignItems="center">
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            component="header"
            sx={{ textAlign: "center" }}
          >
            <Box
              component="img"
              src="/logo.png"
              alt=""
              sx={{ height: 48, width: "auto", display: "block" }}
            />
            <Typography
              variant="h3"
              component="p"
              sx={(t) => ({
                m: 0,
                fontFamily: t.typography.h6.fontFamily,
                fontWeight: 400,
                letterSpacing: 0.2,
                color: "primary.main",
              })}
            >
              <Link href="/" underline="hover" color="inherit">
                {HOME_BRAND}
              </Link>
            </Typography>
          </Stack>
          <Box sx={{ width: "100%" }}>{children}</Box>
        </Stack>
      </Container>
    </Box>
  );
}
