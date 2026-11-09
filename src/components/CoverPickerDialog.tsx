import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  searchCovers,
  setCover,
  uploadCoverFile,
  type CoverFields,
  type CoverOwnerKind,
  type StoredCoverRow,
} from "../api/client";

type Props = {
  open: boolean;
  title: string;
  ownerKind: CoverOwnerKind;
  ownerId: string;
  onClose: () => void;
  onSaved: (row: StoredCoverRow) => void;
  onClear: () => void;
};

export default function CoverPickerDialog({
  open,
  title,
  ownerKind,
  ownerId,
  onClose,
  onSaved,
  onClear,
}: Props) {
  const [query, setQuery] = useState(title);
  const [photos, setPhotos] = useState<CoverFields[]>([]);
  const [empty, setEmpty] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const searchGen = useRef(0);

  const startSearch = useCallback((raw: string) => {
    const q = raw.trim();
    if (!q) {
      setPhotos([]);
      setEmpty(false);
      setNotConfigured(false);
      setActionError("Enter a search term");
      setSearching(false);
      return;
    }
    const gen = ++searchGen.current;
    setSearching(true);
    setPhotos([]);
    setEmpty(false);
    setNotConfigured(false);
    setActionError(null);
    searchCovers(q)
      .then((found) => {
        if (gen !== searchGen.current) return;
        const next = found.slice(0, 6);
        setPhotos(next);
        setEmpty(next.length === 0);
      })
      .catch((err: unknown) => {
        if (gen !== searchGen.current) return;
        setPhotos([]);
        setEmpty(true);
        setNotConfigured(err instanceof ApiError && err.status === 503);
      })
      .finally(() => {
        if (gen === searchGen.current) setSearching(false);
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery(title);
    startSearch(title);
    return () => {
      searchGen.current += 1;
    };
  }, [open, title, startSearch]);

  function run(action: () => void | Promise<void>) {
    setActionError(null);
    void Promise.resolve(action()).catch((err: unknown) => {
      setActionError(
        err instanceof Error ? err.message : "Could not save cover",
      );
    });
  }

  function onSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = query.trim();
    if (!next) {
      setActionError("Enter a search term");
      return;
    }
    startSearch(next);
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setActionError(null);
    void uploadCoverFile(ownerKind, ownerId, file)
      .then((row) => onSaved(row))
      .catch((err: unknown) => {
        setActionError(
          err instanceof Error ? err.message : "Could not upload cover",
        );
      })
      .finally(() => setUploading(false));
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
        <Box
          component="form"
          onSubmit={onSearchSubmit}
          sx={{ display: "flex", gap: 1, mb: 2, mt: 0.5 }}
        >
          <TextField
            size="small"
            fullWidth
            label="Search Unsplash"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            disabled={searching || uploading}
          />
          <Button type="submit" variant="outlined" disabled={searching || uploading}>
            Search
          </Button>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Button component="label" variant="outlined" disabled={uploading}>
            {uploading ? "Uploading…" : "Upload image"}
            <input
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileChange}
            />
          </Button>
        </Box>
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
                onClick={() =>
                  run(async () => {
                    const row = await setCover(ownerKind, ownerId, photo.photoId);
                    onSaved(row);
                  })
                }
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
        <Button onClick={() => run(onClear)} disabled={uploading}>
          No cover
        </Button>
        <Button onClick={onClose} disabled={uploading}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
