import {
  forwardRef,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { DraftCardEditor,
  type DraftEditorChange,
  type DraftPreviewFace,
} from "../draftReview";
import { TOP_BAR_HEIGHT } from "../app/shell/chromeTokens";
import { CreateFlowNotice } from "../library/CreateFlowNotice";
import type { CardDraftView, CardType } from "../api/client";
import DiyCardPreview from "./DiyCardPreview";

const DIY_TOAST_TOP = `calc(${TOP_BAR_HEIGHT}px + env(safe-area-inset-top, 0px) + 10px)`;

const DiyCreateToast = forwardRef<
  HTMLDivElement,
  {
    tone: "error" | "success";
    onClose?: () => void;
    children: ReactNode;
  }
>(function DiyCreateToast({ tone, onClose, children }, ref) {
  return (
    <Box
      ref={ref}
      sx={{
        width: "100%",
        outline: "none",
        "& > [role='status'], & > [role='alert']": {
          bgcolor:
            tone === "error"
              ? "rgba(72, 24, 32, 0.97)"
              : "rgba(32, 14, 30, 0.97)",
          borderColor:
            tone === "error"
              ? "rgba(240, 180, 188, 0.55)"
              : "rgba(209, 163, 226, 0.55)",
          boxShadow: "0 10px 28px rgba(0, 0, 0, 0.45)",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
        },
      }}
    >
      <CreateFlowNotice tone={tone} onClose={onClose}>
        {children}
      </CreateFlowNotice>
    </Box>
  );
});

type Props = {
  createCard: CardDraftView;
  createBusy: boolean;
  createImageBusy: boolean;
  createError: string | null;
  createNotice: string | null;
  createSessionHasCard: boolean;
  createNeedsImage: boolean;
  createImageKey: string;
  deckImageKeys: string[];
  createImageInputRef: React.RefObject<HTMLInputElement | null>;
  onCreateChange: (next: DraftEditorChange) => void;
  onCreateCard: (e?: FormEvent) => void;
  onCreateImageUpload: (file: File) => void;
  applyCreateImageKey: (key: string) => void;
  clearCreateNotice: () => void;
  hubDiyAllowedTypes: CardType[];
  onFinish: () => void;
};

export default function AddMaterialDiyPanel({
  createCard,
  createBusy,
  createImageBusy,
  createError,
  createNotice,
  createSessionHasCard,
  createNeedsImage,
  createImageKey,
  deckImageKeys,
  createImageInputRef,
  onCreateChange,
  onCreateCard,
  onCreateImageUpload,
  applyCreateImageKey,
  clearCreateNotice,
  hubDiyAllowedTypes,
  onFinish,
}: Props) {
  const [previewFace, setPreviewFace] = useState<DraftPreviewFace>("front");

  useEffect(() => {
    setPreviewFace("front");
  }, [createCard.type]);

  useEffect(() => {
    if (!createNotice) return;
    const t = window.setTimeout(() => clearCreateNotice(), 3200);
    return () => window.clearTimeout(t);
  }, [createNotice, clearCreateNotice]);

  const noticeOpen = Boolean(createError || createNotice);

  return (
    <Box
      component="form"
      onSubmit={onCreateCard}
      noValidate
      sx={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        height: { xs: "100%", md: "auto" },
      }}
    >
      <Snackbar
        open={noticeOpen}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{
          top: DIY_TOAST_TOP,
          maxWidth: "min(440px, calc(100% - 24px))",
        }}
      >
        <DiyCreateToast
          tone={createError ? "error" : "success"}
          onClose={
            createNotice && !createError ? clearCreateNotice : undefined
          }
        >
          {createError ? (
            createError
          ) : (
            <>
              <Box
                component="span"
                sx={{ fontWeight: 600, letterSpacing: "0.01em" }}
              >
                Card added
              </Box>
              <Box
                component="span"
                sx={{ color: "text.secondary", fontWeight: 400 }}
              >
                {" · "}
                Create another, or Finish
              </Box>
            </>
          )}
        </DiyCreateToast>
      </Snackbar>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          width: "100%",
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            md: "minmax(0, 1.35fr) minmax(220px, 280px)",
          },
          gridTemplateRows: {
            xs: "auto minmax(0, 1fr)",
            md: "auto",
          },
          gap: { xs: 1.5, md: 4 },
          alignItems: { xs: "stretch", md: "start" },
        }}
      >
        <Stack
          spacing={{ xs: 1.25, md: 2.25 }}
          sx={{ minWidth: 0, width: "100%" }}
        >
          <DraftCardEditor
            card={createCard}
            disabled={createBusy || createImageBusy}
            onChange={onCreateChange}
            allowedTypes={hubDiyAllowedTypes}
            dense
            suppressOcclusionImageEmpty={
              createNeedsImage && !createImageKey
            }
            onPreviewFaceChange={setPreviewFace}
            afterTypePicker={
              createNeedsImage && createImageKey ? (
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{
                    alignItems: { sm: "center" }
                  }}
                >
                  {deckImageKeys.length > 0 ? (
                    <FormControl fullWidth size="small">
                      <InputLabel id="hub-diy-image-key">Image</InputLabel>
                      <Select
                        labelId="hub-diy-image-key"
                        label="Image"
                        value={createImageKey || ""}
                        disabled={createBusy || createImageBusy}
                        onChange={(ev) =>
                          applyCreateImageKey(String(ev.target.value))
                        }
                      >
                        {deckImageKeys.map((key) => (
                          <MenuItem key={key} value={key}>
                            {key.split("/").pop() ?? key}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        color: "text.secondary",
                        flex: 1,
                        minWidth: 0
                      }}>
                      {createImageKey.split("/").pop() ?? createImageKey}
                    </Typography>
                  )}
                  <Button
                    variant="outlined"
                    component="label"
                    disabled={createBusy || createImageBusy}
                    sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                  >
                    {createImageBusy ? "Uploading…" : "Replace image"}
                    <input
                      ref={createImageInputRef}
                      type="file"
                      hidden
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(ev) => {
                        const file = ev.target.files?.[0];
                        if (file) void onCreateImageUpload(file);
                      }}
                    />
                  </Button>
                </Stack>
              ) : null
            }
          />
          {createNeedsImage && !createImageKey ? (
            <Box
              sx={{
                border: 1,
                borderStyle: "dashed",
                borderColor: "divider",
                borderRadius: 2,
                minHeight: 140,
                px: 2.5,
                py: 3,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1.25,
                textAlign: "center",
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {createCard.type === "occlusion"
                  ? "Image required"
                  : "Add an image"}
              </Typography>
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                {createCard.type === "occlusion"
                  ? "Upload or pick a deck image (JPEG, PNG, or WebP up to 8MB), then drag boxes over labels."
                  : "JPEG, PNG, or WebP up to 8MB"}
              </Typography>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ mt: 0.5 }}
              >
                {deckImageKeys.length > 0 ? (
                  <FormControl size="small" sx={{ minWidth: { sm: 200 } }}>
                    <InputLabel id="hub-diy-image-key-empty">
                      Deck image
                    </InputLabel>
                    <Select
                      labelId="hub-diy-image-key-empty"
                      label="Deck image"
                      value=""
                      disabled={createBusy || createImageBusy}
                      onChange={(ev) =>
                        applyCreateImageKey(String(ev.target.value))
                      }
                    >
                      <MenuItem value="">
                        <em>Select…</em>
                      </MenuItem>
                      {deckImageKeys.map((key) => (
                        <MenuItem key={key} value={key}>
                          {key.split("/").pop() ?? key}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : null}
                <Button
                  variant="contained"
                  component="label"
                  disabled={createBusy || createImageBusy}
                >
                  {createImageBusy ? "Uploading…" : "Upload image"}
                  <input
                    ref={createImageInputRef}
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(ev) => {
                      const file = ev.target.files?.[0];
                      if (file) void onCreateImageUpload(file);
                    }}
                  />
                </Button>
              </Stack>
            </Box>
          ) : null}
        </Stack>
        <Box
          sx={{
            position: { md: "sticky" },
            top: { md: 24 },
            alignSelf: { xs: "stretch", md: "start" },
            minHeight: 0,
            height: { xs: "100%", md: "auto" },
            display: "flex",
            flexDirection: "column",
          }}
        >
          <DiyCardPreview
            card={createCard}
            face={previewFace}
            fillHeight
            action={
              <Button
                type="submit"
                variant="contained"
                disabled={createBusy || createImageBusy}
                fullWidth
                sx={{
                  maxWidth: 220,
                  px: 2.5,
                  py: 1.05,
                  borderRadius: 999,
                  textTransform: "none",
                  fontWeight: 600,
                  boxShadow: "none",
                  "&:hover": { boxShadow: "none" },
                }}
              >
                {createBusy ? "Adding…" : "Add card"}
              </Button>
            }
          />
        </Box>
      </Box>
      {createSessionHasCard ? (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            justifyContent: "flex-end",
            alignItems: "center",
            mt: 1.5,
            pt: 1.5,
            flexShrink: 0,
            borderTop: "1px solid",
            borderColor: "rgba(232, 216, 199, 0.12)",
          }}
        >
          <Button
            type="button"
            variant="contained"
            disabled={createBusy}
            onClick={onFinish}
            sx={{
              minWidth: 140,
              px: 2.5,
              py: 1.1,
              borderRadius: 999,
              textTransform: "none",
              fontWeight: 600,
              boxShadow: "none",
              "&:hover": { boxShadow: "none" },
            }}
          >
            Finish
          </Button>
        </Stack>
      ) : null}
    </Box>
  );
}
