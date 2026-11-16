import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onBack: () => void;
  closeMode?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** Kept for call-site compatibility; inline pan ignores dialog maxWidth. */
  maxWidth?: "sm" | "md" | "lg";
};

export default function WorkshopShell({
  open,
  title,
  subtitle,
  onBack,
  closeMode = true,
  children,
  footer,
}: Props) {
  if (!open) return null;

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        animation: "deckHubWorkshopIn 320ms cubic-bezier(0.2, 0, 0, 1)",
        "@keyframes deckHubWorkshopIn": {
          from: { opacity: 0, transform: "translateX(40px)" },
          to: { opacity: 1, transform: "translateX(0)" },
        },
        "@media (prefers-reduced-motion: reduce)": {
          animation: "none",
        },
      }}
    >
      <Stack
        direction="row"
        alignItems="flex-start"
        spacing={1}
        sx={{
          flexShrink: 0,
          pb: 1.75,
          mb: 0.25,
          borderBottom: 1,
          borderColor: "rgba(232, 216, 199, 0.14)",
        }}
      >
        <IconButton
          edge="start"
          aria-label={closeMode ? "Close workshop" : "Back"}
          onClick={onBack}
          sx={{
            mt: -0.25,
            color: "rgba(232, 216, 199, 0.55)",
            "&:hover": {
              color: "primary.light",
              bgcolor: "transparent",
            },
          }}
        >
          {closeMode ? <CloseIcon /> : <ArrowBackIcon />}
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0, pt: 0.35 }}>
          <Typography
            component="p"
            sx={{
              m: 0,
              mb: 0.65,
              fontSize: "0.6875rem",
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(245, 245, 245, 0.48)",
            }}
          >
            Deck hub
          </Typography>
          <Typography
            id="deck-hub-workshop-title"
            variant="h4"
            component="h2"
            sx={{
              m: 0,
              fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
              fontWeight: 400,
              letterSpacing: "0.02em",
              lineHeight: 1.12,
              color: "text.primary",
            }}
          >
            {title}
          </Typography>
          {subtitle ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.75, maxWidth: "42ch", lineHeight: 1.5 }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Stack>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          pt: 1.5,
        }}
      >
        {children}
      </Box>

      {footer ? (
        <Box
          sx={{
            flexShrink: 0,
            pt: 1.5,
            mt: 1,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          {footer}
        </Box>
      ) : null}
    </Box>
  );
}
