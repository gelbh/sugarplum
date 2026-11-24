import { useState, type DragEvent, type FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { CreateFlowNotice } from "../library/CreateFlowNotice";
import { MAX_IMAGE_BYTES, fileSizeCapMb } from "../materials/kernel";
import { resolveUploadContentType } from "../api/client";
import { FOOTER_BTN_SX, PRIMARY_PILL_SX } from "./AddMaterialMethodChooser";
import {
  UPLOAD_ACCEPT,
  formatUploadBytes,
  isAllowedUploadFile,
  uploadKindLabel,
} from "./addMaterialUploadHelpers";

type Props = {
  materialBusy: boolean;
  readingScan: boolean;
  alsoCover: string;
  onAlsoCoverChange: (value: string) => void;
  uploadFile: File | null;
  onUploadFileChange: (file: File | null) => void;
  onFigureFilesChange: (files: File[]) => void;
  onUploadFile: (e?: FormEvent) => void;
  offerLearningObjectives: boolean;
  submitLabel: "Continue" | "Start generation";
  submitDisabled?: boolean;
  freePathImageHelper: string | null;
};

export default function AddMaterialUploadPanel({
  materialBusy,
  readingScan,
  alsoCover,
  onAlsoCoverChange,
  uploadFile,
  onUploadFileChange,
  onFigureFilesChange,
  onUploadFile,
  offerLearningObjectives,
  submitLabel,
  submitDisabled = false,
  freePathImageHelper,
}: Props) {
  const [dropActive, setDropActive] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  function applyUploadFile(file: File | null) {
    setDropError(null);
    onUploadFileChange(file);
    if (!file || resolveUploadContentType(file) !== "application/pdf") {
      onFigureFilesChange([]);
    }
  }

  function onDropZoneDrop(ev: DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    setDropActive(false);
    const file = ev.dataTransfer.files?.[0] ?? null;
    if (!file) return;
    if (!isAllowedUploadFile(file)) {
      setDropError("Use a PDF, PPTX, or image (JPEG, PNG, WebP).");
      return;
    }
    applyUploadFile(file);
  }

  return (
    <Box component="form" onSubmit={onUploadFile} noValidate>
      <Stack spacing={2.5}>
        {dropError ? (
          <CreateFlowNotice tone="error" onClose={() => setDropError(null)}>
            {dropError}
          </CreateFlowNotice>
        ) : null}
        <Box
          onDragEnter={(ev) => {
            if (materialBusy) return;
            ev.preventDefault();
            setDropActive(true);
          }}
          onDragOver={(ev) => {
            if (materialBusy) return;
            ev.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={(ev) => {
            ev.preventDefault();
            if (ev.currentTarget.contains(ev.relatedTarget as Node)) return;
            setDropActive(false);
          }}
          onDrop={(ev) => {
            if (materialBusy) {
              ev.preventDefault();
              setDropActive(false);
              return;
            }
            onDropZoneDrop(ev);
          }}
          sx={(theme) => ({
            border: 1,
            borderStyle: uploadFile ? "solid" : "dashed",
            borderColor: dropActive
              ? "primary.main"
              : uploadFile
                ? "rgba(232, 216, 199, 0.16)"
                : "rgba(232, 216, 199, 0.22)",
            bgcolor: dropActive
              ? alpha(theme.palette.primary.main, 0.1)
              : uploadFile
                ? "rgba(18, 7, 15, 0.45)"
                : "rgba(18, 7, 15, 0.22)",
            borderRadius: 2.5,
            minHeight: uploadFile ? 152 : 188,
            px: 2.5,
            py: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1.5,
            textAlign: "center",
            opacity: materialBusy ? 0.72 : 1,
            pointerEvents: materialBusy ? "none" : "auto",
            transition: "border-color 160ms ease, background-color 160ms ease",
          })}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              color: "primary.light",
              bgcolor: "rgba(91, 44, 111, 0.28)",
              border: "1px solid",
              borderColor: "rgba(209, 163, 226, 0.28)",
            }}
          >
            {uploadFile ? (
              <InsertDriveFileOutlinedIcon sx={{ fontSize: 22 }} />
            ) : (
              <UploadFileOutlinedIcon sx={{ fontSize: 22 }} />
            )}
          </Box>
          {uploadFile ? (
            <Stack
              spacing={0.75}
              sx={{
                alignItems: "center",
                width: "100%"
              }}>
              <Typography
                component="p"
                sx={{
                  m: 0,
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "primary.light",
                }}
              >
                {uploadKindLabel(uploadFile)}
                {" · "}
                {formatUploadBytes(uploadFile.size)}
              </Typography>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.35,
                  maxWidth: 360,
                  px: 1,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
                title={uploadFile.name}
              >
                {uploadFile.name}
              </Typography>
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                Ready to generate
              </Typography>
              <Button
                component="label"
                disabled={materialBusy}
                sx={{
                  ...FOOTER_BTN_SX,
                  mt: 0.25,
                  fontSize: "0.8125rem",
                }}
              >
                Replace file
                <input
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  hidden
                  onChange={(ev) => {
                    applyUploadFile(ev.target.files?.[0] ?? null);
                  }}
                />
              </Button>
            </Stack>
          ) : (
            <Stack spacing={1.25} sx={{
              alignItems: "center"
            }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Drop PDF, PPTX, or image here
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mt: 0.5
                  }}>
                  PDF/PPTX max {fileSizeCapMb()}MB · images max{" "}
                  {fileSizeCapMb(MAX_IMAGE_BYTES)}MB
                </Typography>
              </Box>
              <Button
                variant="contained"
                component="label"
                disabled={materialBusy}
                sx={PRIMARY_PILL_SX}
              >
                Choose file
                <input
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  hidden
                  onChange={(ev) => {
                    applyUploadFile(ev.target.files?.[0] ?? null);
                  }}
                />
              </Button>
            </Stack>
          )}
        </Box>
        {uploadFile && offerLearningObjectives ? (
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
        {uploadFile && !offerLearningObjectives && freePathImageHelper ? (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {freePathImageHelper}
          </Typography>
        ) : null}
        {uploadFile ? (
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
              disabled={submitDisabled}
              sx={PRIMARY_PILL_SX}
            >
              {materialBusy
                ? readingScan
                  ? "Reading scanned pages…"
                  : "Uploading…"
                : submitLabel}
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}
