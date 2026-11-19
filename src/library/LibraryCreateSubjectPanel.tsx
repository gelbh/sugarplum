import type { FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { shouldAutoFocusText } from "../shared/lib/autoFocusText";

type Props = {
  guest: boolean;
  titleValue: string;
  setTitleValue: (value: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: (e?: FormEvent) => void | Promise<void>;
  onCancel: () => void;
  overline?: string;
  heading?: string;
  blurb?: string;
  fieldLabel?: string;
  placeholder?: string;
  submitLabel?: string;
  busyLabel?: string;
};

export function LibraryCreateSubjectPanel({
  guest,
  titleValue,
  setTitleValue,
  busy,
  error,
  onSubmit,
  onCancel,
  overline = "New subject",
  heading = "Name this collection",
  blurb,
  fieldLabel = "Subject name",
  placeholder = "e.g. Anatomy",
  submitLabel = "Continue",
  busyLabel = "Creating…",
}: Props) {
  const resolvedBlurb =
    blurb ??
    (guest
      ? "Shown on your cover poster. You can add decks next."
      : "Shown on your cover poster. Next you will pick a photo.");

  return (
    <Box
      sx={{
        flex: 1,
        width: "100%",
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: { xs: 3, md: 4 },
      }}
    >
      <Box
        component="form"
        onSubmit={onSubmit}
        noValidate
        sx={{
          width: "100%",
          maxWidth: 420,
        }}
      >
        <Stack spacing={2.5}>
          <Box>
            <Typography
              component="p"
              sx={{
                m: 0,
                mb: 0.75,
                fontSize: "0.6875rem",
                fontWeight: 500,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "primary.main",
              }}
            >
              {overline}
            </Typography>
            <Typography
              variant="h3"
              component="h2"
              sx={{
                m: 0,
                fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
                fontWeight: 400,
                letterSpacing: "0.02em",
                lineHeight: 1.15,
                color: "text.primary",
              }}
            >
              {heading}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mt: 1,
                maxWidth: "40ch",
                lineHeight: 1.5
              }}>
              {resolvedBlurb}
            </Typography>
          </Box>

          <TextField
            autoFocus={shouldAutoFocusText()}
            margin="none"
            label={fieldLabel}
            placeholder={placeholder}
            value={titleValue}
            onChange={(ev) => setTitleValue(ev.target.value)}
            required
            fullWidth
            error={Boolean(error)}
            helperText={error ?? `${titleValue.trim().length}/80`}
            slotProps={{
              htmlInput: { maxLength: 80, "aria-label": fieldLabel },

              formHelperText: {
                sx: {
                  textAlign: error ? "left" : "right",
                  mx: 0,
                  mt: 0.75,
                },
              }
            }} />

          <Stack direction="row" spacing={1} sx={{
            justifyContent: "flex-end"
          }}>
            <Button
              onClick={onCancel}
              disabled={busy}
              sx={{ color: "text.secondary" }}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={busy || !titleValue.trim()}
              sx={{ minWidth: 128 }}
            >
              {busy ? busyLabel : submitLabel}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
