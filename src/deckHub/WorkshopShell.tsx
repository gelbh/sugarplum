import { ViewTransition, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
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
  maxWidth = "md",
}: Props) {
  const phone = useMediaQuery((t: Theme) => t.breakpoints.down("sm"));

  return (
    <Dialog
      open={open}
      onClose={onBack}
      fullWidth
      maxWidth={maxWidth}
      fullScreen={phone}
      aria-labelledby="deck-hub-workshop-title"
    >
      <ViewTransition name="deck-hub-workshop" share="deck-hub-workshop">
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            minHeight: phone ? "100%" : undefined,
            maxHeight: phone ? "100%" : "90vh",
          }}
        >
          <DialogTitle
            id="deck-hub-workshop-title"
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
              pr: 1,
            }}
          >
            <IconButton
              edge="start"
              aria-label={closeMode ? "Close workshop" : "Back"}
              onClick={onBack}
              sx={{ mt: -0.5 }}
            >
              {closeMode ? <CloseIcon /> : <ArrowBackIcon />}
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>
                {title}
              </Typography>
              {subtitle ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.25 }}
                >
                  {subtitle}
                </Typography>
              ) : null}
            </Box>
          </DialogTitle>
          <DialogContent
            dividers
            sx={{
              flex: 1,
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {children}
          </DialogContent>
          {footer ? (
            <Box
              sx={{
                px: 3,
                py: 1.5,
                borderTop: 1,
                borderColor: "divider",
              }}
            >
              {footer}
            </Box>
          ) : null}
        </Box>
      </ViewTransition>
    </Dialog>
  );
}
