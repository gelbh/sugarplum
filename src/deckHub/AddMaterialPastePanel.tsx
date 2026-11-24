import type { FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { PRIMARY_PILL_SX } from "./AddMaterialMethodChooser";

type Props = {
  guest: boolean;
  materialBusy: boolean;
  pasteText: string;
  onPasteTextChange: (value: string) => void;
  pasteFilename: string;
  onPasteFilenameChange: (value: string) => void;
  alsoCover: string;
  onAlsoCoverChange: (value: string) => void;
  onGuestPaste: (e?: FormEvent) => void;
  onAccountPaste: (e?: FormEvent) => void;
};

export default function AddMaterialPastePanel({
  guest,
  materialBusy,
  pasteText,
  onPasteTextChange,
  pasteFilename,
  onPasteFilenameChange,
  alsoCover,
  onAlsoCoverChange,
  onGuestPaste,
  onAccountPaste,
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
        {pasteText.trim() ? (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              justifyContent: "flex-end",
              alignItems: "center",
              pt: 2,
              borderTop: "1px solid",
              borderColor: "rgba(232, 216, 199, 0.12)",
            }}
          >
            <Button
              type="submit"
              variant="contained"
              disabled={materialBusy}
              sx={PRIMARY_PILL_SX}
            >
              {materialBusy ? "Saving…" : "Generate from paste"}
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}
