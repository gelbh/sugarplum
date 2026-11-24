import type { ReactNode } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ContentPasteOutlinedIcon from "@mui/icons-material/ContentPasteOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";

export type AddMaterialTab = "upload" | "paste" | "diy";

export const METHOD_META: Record<
  AddMaterialTab,
  { label: string; heading: string; blurb: string; Icon: SvgIconComponent }
> = {
  upload: {
    label: "Upload",
    heading: "Upload notes",
    blurb: "Drop lecture slides or notes. We generate draft cards next.",
    Icon: UploadFileOutlinedIcon,
  },
  paste: {
    label: "Paste",
    heading: "Paste text",
    blurb: "Paste notes or excerpts. We turn them into draft cards.",
    Icon: ContentPasteOutlinedIcon,
  },
  diy: {
    label: "Create a card",
    heading: "Create a card",
    blurb: "Build one card by hand and add it to this deck.",
    Icon: EditNoteOutlinedIcon,
  },
};

export const FOOTER_BTN_SX = {
  color: "text.secondary",
  textTransform: "none",
  fontWeight: 500,
  px: 0.5,
  minWidth: 0,
  "&:hover": {
    bgcolor: "transparent",
    color: "text.primary",
  },
} as const;

export const PRIMARY_PILL_SX = {
  minWidth: 140,
  px: 2.5,
  py: 1.1,
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  boxShadow: "none",
  "&:hover": { boxShadow: "none" },
} as const;

export function StepHeader({
  heading,
  blurb,
  compact = false,
}: {
  heading: string;
  blurb: string;
  /** Tighter mobile chrome (DIY write-card one-screen). */
  compact?: boolean;
}) {
  return (
    <Box>
      <Typography
        component="p"
        sx={{
          m: 0,
          mb: compact ? 0.35 : 0.75,
          fontSize: "0.6875rem",
          fontWeight: 500,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "primary.main",
          display: compact ? { xs: "none", md: "block" } : undefined,
        }}
      >
        Create flashcards
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
          ...(compact
            ? { fontSize: { xs: "1.5rem", md: undefined } }
            : {}),
        }}
      >
        {heading}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          display: compact ? { xs: "none", md: "block" } : undefined,
          color: "text.secondary",
          mt: 1,
          maxWidth: "40ch",
          lineHeight: 1.5
        }}>
        {blurb}
      </Typography>
    </Box>
  );
}

type Props = {
  guest: boolean;
  methods: AddMaterialTab[];
  onTabChange: (tab: AddMaterialTab) => void;
  onCancel: () => void;
  alerts: ReactNode;
};

export default function AddMaterialMethodChooser({
  guest,
  methods,
  onTabChange,
  onCancel,
  alerts,
}: Props) {
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
      <Stack spacing={2.5} sx={{ width: "100%", maxWidth: 520 }}>
        <StepHeader
          heading="How do you want to start?"
          blurb={
            guest
              ? "Paste text or create a card. Sign in to upload files."
              : "Upload notes, paste text, or create a card by hand."
          }
        />
        {alerts}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: `repeat(${methods.length}, minmax(0, 1fr))`,
            },
            gap: 1.25,
          }}
          aria-label="Create flashcards methods"
        >
          {methods.map((id) => {
            const meta = METHOD_META[id];
            const Icon = meta.Icon;
            return (
              <ButtonBase
                key={id}
                focusRipple
                onClick={() => onTabChange(id)}
                aria-label={meta.label}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 1,
                  p: 1.75,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "rgba(232, 216, 199, 0.16)",
                  bgcolor: "#12070f",
                  textAlign: "left",
                  "&:hover": {
                    borderColor: "primary.main",
                  },
                }}
              >
                <Icon sx={{ fontSize: 26, color: "primary.light" }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {meta.label}
                </Typography>
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
                  {meta.blurb}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>
        <Stack
          direction="row"
          sx={{
            justifyContent: "flex-start",
            alignItems: "center",
            pt: 2,
            borderTop: "1px solid",
            borderColor: "rgba(232, 216, 199, 0.12)"
          }}>
          <Button onClick={onCancel} sx={FOOTER_BTN_SX}>
            Back
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
