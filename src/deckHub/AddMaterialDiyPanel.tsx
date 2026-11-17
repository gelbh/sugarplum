import { useEffect, useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DraftCardEditor, {
  type DraftEditorChange,
  type DraftPreviewFace,
} from "../components/DraftCardEditor";
import { CreateFlowNoticeFade } from "../library/CreateFlowNotice";
import type { CardDraftView, CardType } from "../api/client";
import DiyCardPreview from "./DiyCardPreview";
import { FOOTER_BTN_SX } from "./AddMaterialMethodChooser";

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
  onBack: () => void;
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
  onBack,
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

  return (
    <Box component="form" onSubmit={onCreateCard} noValidate>
      <Box
        aria-live="polite"
        sx={{
          minHeight: 40,
          mb: 1.5,
          display: "flex",
          alignItems: "center",
        }}
      >
        <CreateFlowNoticeFade
          open={Boolean(createError || createNotice)}
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
                Write another, or Finish
              </Box>
            </>
          )}
        </CreateFlowNoticeFade>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "minmax(0, 1.35fr) minmax(220px, 280px)",
          },
          gap: { xs: 2.5, md: 4 },
          alignItems: "start",
        }}
      >
        <Stack spacing={2.25}>
          <DraftCardEditor
            card={createCard}
            disabled={createBusy || createImageBusy}
            onChange={onCreateChange}
            allowedTypes={hubDiyAllowedTypes}
            typePicker="cards"
            onPreviewFaceChange={setPreviewFace}
            afterTypePicker={
              createNeedsImage && createImageKey ? (
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ sm: "center" }}
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
                      color="text.secondary"
                      sx={{ flex: 1, minWidth: 0 }}
                      noWrap
                    >
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
                Add an image
              </Typography>
              <Typography variant="body2" color="text.secondary">
                JPEG, PNG, or WebP up to 8MB
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
            order: { xs: -1, md: 0 },
            alignSelf: { md: "start" },
          }}
        >
          <DiyCardPreview
            card={createCard}
            face={previewFace}
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
      <Stack
        direction="row"
        spacing={1.5}
        justifyContent="space-between"
        alignItems="center"
        sx={{
          mt: 3,
          pt: 2,
          borderTop: "1px solid",
          borderColor: "rgba(232, 216, 199, 0.12)",
        }}
      >
        <Button onClick={onBack} disabled={createBusy} sx={FOOTER_BTN_SX}>
          Back
        </Button>
        {createSessionHasCard ? (
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
        ) : null}
      </Stack>
    </Box>
  );
}
