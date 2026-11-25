import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import type { MaterialListItem } from "../../api/client";
import { downloadMaterialUrl, mediaUrl } from "../../api/client";
import { workshopMaterialTitle } from "../workshop/workshopSearch";
import { PILL_BTN } from "../workshop/workshopChrome";

export default function MaterialPreviewDialog({
  material,
  guest,
  onClose,
}: {
  material: MaterialListItem | null;
  guest: boolean;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    function clearBlob() {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
    }

    if (!material || guest || !material.r2_key) {
      clearBlob();
      setTextBody(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    if (
      material.kind === "image" ||
      material.kind === "pptx" ||
      material.kind === "topic"
    ) {
      clearBlob();
      setTextBody(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    clearBlob();
    setLoading(true);
    setLoadError(null);
    setTextBody(null);

    void (async () => {
      try {
        const res = await fetch(downloadMaterialUrl(material.id), {
          credentials: "same-origin",
        });
        if (!res.ok) {
          throw new Error(`Could not open file (${res.status})`);
        }
        if (material.kind === "text" || material.kind === "paste") {
          const text = await res.text();
          if (!cancelled) setTextBody(text);
        } else {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          blobUrlRef.current = url;
          setBlobUrl(url);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not open file",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [material, guest]);

  const open = material !== null;
  const title = material ? workshopMaterialTitle(material) : "File";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={material?.kind === "pdf" ? "lg" : "md"}
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            bgcolor: "#12070f",
            backgroundImage: "none",
            border: "1px solid rgba(232, 216, 199, 0.14)",
            minHeight: material?.kind === "pdf" ? "70vh" : undefined,
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
          fontWeight: 400,
          pr: 2,
        }}
      >
        {title}
      </DialogTitle>
      <DialogContent
        sx={{
          px: 2.5,
          pb: 1.5,
          display: "flex",
          flexDirection: "column",
          minHeight: material?.kind === "pdf" ? "55vh" : 200,
        }}
      >
        {loading ? (
          <Box sx={{ flex: 1, display: "grid", placeItems: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : loadError ? (
          <Typography color="error" variant="body2">
            {loadError}
          </Typography>
        ) : material?.kind === "image" && material.r2_key ? (
          <Box
            component="img"
            src={mediaUrl(material.r2_key)}
            alt={title}
            sx={{
              maxWidth: "100%",
              maxHeight: "70vh",
              objectFit: "contain",
              mx: "auto",
              display: "block",
              borderRadius: 1,
            }}
          />
        ) : material?.kind === "pdf" && blobUrl ? (
          <Box
            component="iframe"
            title={title}
            src={blobUrl}
            sx={{
              flex: 1,
              width: "100%",
              minHeight: "55vh",
              border: 0,
              borderRadius: 1,
              bgcolor: "#1a1018",
            }}
          />
        ) : textBody != null ? (
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              borderRadius: 1.5,
              border: "1px solid rgba(232, 216, 199, 0.12)",
              bgcolor: "rgba(18, 7, 15, 0.45)",
              color: "rgba(245, 245, 245, 0.88)",
              fontSize: "0.8125rem",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "60vh",
              overflow: "auto",
            }}
          >
            {textBody || "(empty file)"}
          </Box>
        ) : material ? (
          <Stack spacing={1.25} sx={{ py: 2 }}>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              {material.kind === "pptx"
                ? "PowerPoint files open via download. Preview is not available in the browser."
                : "This file cannot be previewed here."}
            </Typography>
            {material.r2_key && !guest ? (
              <Button
                variant="outlined"
                href={downloadMaterialUrl(material.id)}
                startIcon={<FileDownloadOutlinedIcon />}
                sx={PILL_BTN}
              >
                Download file
              </Button>
            ) : null}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.75, gap: 1 }}>
        {material?.r2_key && !guest ? (
          <Button
            href={downloadMaterialUrl(material.id)}
            startIcon={<FileDownloadOutlinedIcon />}
            sx={{
              ...PILL_BTN,
              color: "rgba(232, 216, 199, 0.75)",
            }}
          >
            Download
          </Button>
        ) : null}
        <Button onClick={onClose} variant="contained" sx={PILL_BTN}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
