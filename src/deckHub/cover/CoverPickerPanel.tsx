import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  searchCovers,
  uploadCoverFile,
  type CoverFields,
  type CoverOwnerKind,
  type StoredCoverRow,
} from "../../api/client";
import { CreateFlowNotice } from "../../library/CreateFlowNotice";
import CoverPosterGrid from "./CoverPosterGrid";
import CoverUploadTile from "./CoverUploadTile";

type Props = {
  active: boolean;
  title: string;
  ownerKind: CoverOwnerKind;
  ownerId: string;
  onSaved: (row: StoredCoverRow) => void;
  onClear: () => void;
  onCancel: () => void;
  /** Return to the previous create step (inline flow). */
  onBack?: () => void;
  /** Magazine header for the in-page create flow. */
  inlineChrome?: boolean;
};

export default function CoverPickerPanel({
  active,
  title,
  ownerKind,
  ownerId,
  onSaved,
  onClear,
  onCancel,
  onBack,
  inlineChrome = false,
}: Props) {
  const [query, setQuery] = useState(title);
  const [photos, setPhotos] = useState<CoverFields[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [empty, setEmpty] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const searchGen = useRef(0);

  const busy = searching || uploading || pickingId !== null;

  const startSearch = useCallback((raw: string, nextPage = 1) => {
    const q = raw.trim();
    if (!q) {
      setPhotos([]);
      setPage(1);
      setTotalPages(1);
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
    searchCovers(q, nextPage)
      .then((result) => {
        if (gen !== searchGen.current) return;
        setPhotos(result.photos);
        setPage(result.page);
        setTotalPages(Math.max(1, result.totalPages));
        setEmpty(result.photos.length === 0);
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
    if (!active) return;
    setQuery(title);
    startSearch(title, 1);
    return () => {
      searchGen.current += 1;
    };
  }, [active, title, startSearch]);

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
    startSearch(next, 1);
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

  function renderPosterGrid(fillHeight: boolean) {
    return (
      <CoverPosterGrid
        fillHeight={fillHeight}
        busy={busy}
        searching={searching}
        uploading={uploading}
        photos={photos}
        pickingId={pickingId}
        ownerKind={ownerKind}
        ownerId={ownerId}
        onFileChange={onFileChange}
        run={run}
        setPickingId={setPickingId}
        onSaved={onSaved}
      />
    );
  }

  const pager =
    !empty && totalPages > 1 ? (
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}>
        <Button
          size="small"
          disabled={busy || page <= 1}
          onClick={() => startSearch(query, page - 1)}
        >
          Previous
        </Button>
        <Typography variant="caption" sx={{
          color: "text.secondary"
        }}>
          {page} / {totalPages}
        </Typography>
        <Button
          size="small"
          disabled={busy || page >= totalPages}
          onClick={() => startSearch(query, page + 1)}
        >
          Next
        </Button>
      </Stack>
    ) : null;

  const actions = (
    <Stack
      direction="row"
      useFlexGap
      sx={{
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1,
        flexShrink: 0
      }}>
      {onBack ? (
        <Button
          onClick={onBack}
          disabled={busy}
          sx={{ color: "text.secondary" }}
        >
          Back
        </Button>
      ) : (
        <Box />
      )}
      <Stack direction="row" spacing={1}>
        {!inlineChrome ? (
          <Button
            onClick={() => run(onClear)}
            disabled={busy}
            sx={{ color: "text.secondary" }}
          >
            No cover
          </Button>
        ) : null}
        <Button
          onClick={onCancel}
          disabled={busy}
          variant={inlineChrome ? "outlined" : "text"}
          size="small"
        >
          {inlineChrome ? "Skip" : "Cancel"}
        </Button>
      </Stack>
    </Stack>
  );

  if (!inlineChrome) {
    return (
      <Stack spacing={2}>
        {actionError ? <Alert severity="error">{actionError}</Alert> : null}
        <Box
          component="form"
          onSubmit={onSearchSubmit}
          sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}
        >
          <TextField
            size="small"
            fullWidth
            label="Search Unsplash"
            placeholder="e.g. anatomy textbook"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            disabled={busy}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            sx={{ minWidth: 96, height: 40, flexShrink: 0 }}
          >
            {searching ? "…" : "Search"}
          </Button>
        </Box>
        {empty && !searching ? (
          <Stack spacing={1.5}>
            <Box
              sx={{
                maxWidth: { xs: "50%", sm: "33%" },
              }}
            >
              <CoverUploadTile
                fillHeight={false}
                busy={busy}
                uploading={uploading}
                onFileChange={onFileChange}
              />
            </Box>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              {notConfigured
                ? "Cover search is not configured"
                : "No Unsplash photos matched. Upload your own, or try another search."}
            </Typography>
          </Stack>
        ) : (
          renderPosterGrid(false)
        )}
        {pager}
        {actions}
      </Stack>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        width: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        px: { xs: 1.5, sm: 2 },
        py: { xs: 1.5, md: 2 },
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          maxWidth: 560,
          mx: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <Box sx={{ flexShrink: 0, textAlign: { xs: "left", sm: "center" } }}>
          <Typography
            component="p"
            sx={{
              m: 0,
              mb: 0.5,
              fontSize: "0.6875rem",
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "primary.main",
            }}
          >
            Almost done
          </Typography>
          <Typography
            variant="h4"
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
            Choose a cover
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 0.5,
              maxWidth: "42ch",
              lineHeight: 1.4,
              mx: { sm: "auto" }
            }}>
            Tap a poster for <Box component="strong">{title}</Box>, upload your
            own, or skip.
          </Typography>
        </Box>

        {actionError ? (
          <CreateFlowNotice tone="error" onClose={() => setActionError(null)}>
            {actionError}
          </CreateFlowNotice>
        ) : null}

        <Box
          component="form"
          onSubmit={onSearchSubmit}
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "flex-start",
            flexShrink: 0,
          }}
        >
          <TextField
            size="small"
            fullWidth
            label="Search Unsplash"
            placeholder="e.g. anatomy textbook"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            disabled={busy}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            sx={{ minWidth: 88, height: 40, flexShrink: 0 }}
          >
            {searching ? "…" : "Search"}
          </Button>
        </Box>

        {empty && !searching ? (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.5,
            }}
          >
            <Box sx={{ width: "100%", maxWidth: 160, aspectRatio: "3 / 4" }}>
              <CoverUploadTile
                fillHeight={true}
                busy={busy}
                uploading={uploading}
                onFileChange={onFileChange}
              />
            </Box>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                maxWidth: "34ch",
                textAlign: "center"
              }}>
              {notConfigured
                ? "Cover search is not configured on this environment."
                : "No Unsplash photos matched. Upload your own, or try another search."}
            </Typography>
          </Box>
        ) : (
          renderPosterGrid(true)
        )}

        {pager}
        {actions}
      </Box>
    </Box>
  );
}
