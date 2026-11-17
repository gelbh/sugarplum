import type { FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { FOOTER_BTN_SX, PRIMARY_PILL_SX } from "./AddMaterialMethodChooser";

type Props = {
  guest: boolean;
  materialBusy: boolean;
  createBusy: boolean;
  pasteText: string;
  onPasteTextChange: (value: string) => void;
  pasteFilename: string;
  onPasteFilenameChange: (value: string) => void;
  alsoCover: string;
  onAlsoCoverChange: (value: string) => void;
  onGuestPaste: (e?: FormEvent) => void;
  onAccountPaste: (e?: FormEvent) => void;
  onBack: () => void;
};

export default function AddMaterialPastePanel({
  guest,
  materialBusy,
  createBusy,
  pasteText,
  onPasteTextChange,
  pasteFilename,
  onPasteFilenameChange,
  alsoCover,
  onAlsoCoverChange,
  onGuestPaste,
  onAccountPaste,
  onBack,
}: Props) {
  return (
    <Box
      component="form"
      onSubmit={guest ? onGuestPaste : onAccountPaste}
      noValidate
    >
      <Stack spacing={2.5}>
        <Stack spacing={2}>
          {!guest ? (
            <TextField
              label="Filename (optional)"
              value={pasteFilename}
              onChange={(ev) => onPasteFilenameChange(ev.target.value)}
              fullWidth
            />
          ) : null}
          <TextField
            label="Paste text"
            value={pasteText}
            onChange={(ev) => onPasteTextChange(ev.target.value)}
            required
            fullWidth
            multiline
            minRows={6}
          />
          {!guest ? (
            <TextField
              label="Learning objectives (optional)"
              name="alsoCover"
              value={alsoCover}
              onChange={(ev) => onAlsoCoverChange(ev.target.value)}
              fullWidth
              multiline
              minRows={2}
              disabled={materialBusy}
              helperText="One objective or focus topic per line, up to 20"
            />
          ) : null}
        </Stack>
        <Stack
          direction="row"
          spacing={1.5}
          justifyContent="space-between"
          alignItems="center"
          sx={{
            pt: 2,
            borderTop: "1px solid",
            borderColor: "rgba(232, 216, 199, 0.12)",
          }}
        >
          <Button
            onClick={onBack}
            disabled={materialBusy || createBusy}
            sx={FOOTER_BTN_SX}
          >
            Back
          </Button>
          {pasteText.trim() ? (
            <Button
              type="submit"
              variant="contained"
              disabled={materialBusy}
              sx={PRIMARY_PILL_SX}
            >
              {materialBusy ? "Saving…" : "Generate from paste"}
            </Button>
          ) : null}
        </Stack>
      </Stack>
    </Box>
  );
}
