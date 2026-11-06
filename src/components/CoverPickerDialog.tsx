import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { ApiError, searchCovers, type CoverFields } from "../api/client";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  onPick: (photoId: string) => void;
  onClear: () => void;
};

export default function CoverPickerDialog({
  open,
  title,
  onClose,
  onPick,
  onClear,
}: Props) {
  const [photos, setPhotos] = useState<CoverFields[]>([]);
  const [empty, setEmpty] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhotos([]);
    setEmpty(false);
    setNotConfigured(false);
    setActionError(null);
    searchCovers(title)
      .then((found) => {
        if (cancelled) return;
        const next = found.slice(0, 6);
        setPhotos(next);
        setEmpty(next.length === 0);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPhotos([]);
        setEmpty(true);
        setNotConfigured(err instanceof ApiError && err.status === 503);
      });
    return () => {
      cancelled = true;
    };
  }, [open, title]);

  function run(action: () => void | Promise<void>) {
    setActionError(null);
    void Promise.resolve(action()).catch((err: unknown) => {
      setActionError(
        err instanceof Error ? err.message : "Could not save cover",
      );
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          variant: "outlined",
          elevation: 0,
          sx: { bgcolor: "background.paper" },
        },
      }}
    >
      <DialogTitle>Choose a cover</DialogTitle>
      <DialogContent>
        {actionError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {actionError}
          </Alert>
        ) : null}
        {empty ? (
          <Typography color="text.secondary">
            {notConfigured
              ? "Cover search is not configured"
              : "No photos for this title."}
          </Typography>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
            }}
          >
            {photos.map((photo) => (
              <Box
                key={photo.photoId}
                component="button"
                type="button"
                aria-label={`Photo by ${photo.photographerName}`}
                onClick={() => run(() => onPick(photo.photoId))}
                sx={{
                  p: 0,
                  m: 0,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: "background.paper",
                  boxShadow: "none",
                  cursor: "pointer",
                  lineHeight: 0,
                }}
              >
                <Box
                  component="img"
                  src={photo.imageUrl}
                  alt=""
                  sx={{
                    display: "block",
                    width: "100%",
                    height: 96,
                    objectFit: "cover",
                  }}
                />
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => run(onClear)}>No cover</Button>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
