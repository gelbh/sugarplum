import { useEffect, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import HighlightOffOutlinedIcon from "@mui/icons-material/HighlightOffOutlined";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";

type Tone = "error" | "success" | "info" | "reject";

type Props = {
  tone?: Tone;
  children: ReactNode;
  onClose?: () => void;
  /** Optional primary action (e.g. Undo). */
  action?: ReactNode;
  /** Night stage surface (ivory copy on plum wash). */
  stage?: boolean;
};

const FADE_MS = 260;

const TONE = {
  error: {
    Icon: ErrorOutlinedIcon,
    border: "rgba(229, 115, 115, 0.45)",
    bg: "rgba(91, 28, 36, 0.35)",
    icon: "error.light",
    stageBorder: "rgba(240, 180, 188, 0.48)",
    stageBg:
      "linear-gradient(135deg, rgba(196, 92, 106, 0.28), rgba(18, 7, 15, 0.55))",
    stageIcon: "var(--sp-grade-again-fg, #f0b4bc)",
    stageGlow: "0 10px 28px rgba(8, 2, 10, 0.35)",
  },
  reject: {
    Icon: HighlightOffOutlinedIcon,
    border: "rgba(240, 180, 188, 0.4)",
    bg: "rgba(196, 92, 106, 0.16)",
    icon: "error.light",
    stageBorder: "rgba(240, 180, 188, 0.46)",
    stageBg:
      "linear-gradient(135deg, rgba(196, 92, 106, 0.24), rgba(18, 7, 15, 0.52))",
    stageIcon: "var(--sp-grade-again-fg, #f0b4bc)",
    stageGlow: "0 10px 28px rgba(8, 2, 10, 0.32)",
  },
  success: {
    Icon: CheckCircleOutlinedIcon,
    border: "rgba(209, 163, 226, 0.32)",
    bg: "rgba(91, 44, 111, 0.28)",
    icon: "primary.light",
    stageBorder: "rgba(209, 163, 226, 0.48)",
    stageBg:
      "linear-gradient(135deg, rgba(91, 44, 111, 0.42), rgba(18, 7, 15, 0.55))",
    stageIcon: "primary.light",
    stageGlow: "0 10px 28px rgba(8, 2, 10, 0.35)",
  },
  info: {
    Icon: InfoOutlinedIcon,
    border: "rgba(209, 163, 226, 0.35)",
    bg: "rgba(91, 44, 111, 0.22)",
    icon: "primary.light",
    stageBorder: "rgba(232, 216, 199, 0.32)",
    stageBg:
      "linear-gradient(135deg, rgba(91, 44, 111, 0.28), rgba(18, 7, 15, 0.55))",
    stageIcon: "rgba(232, 216, 199, 0.9)",
    stageGlow: "0 10px 28px rgba(8, 2, 10, 0.3)",
  },
} as const;

/** Soft inline notice for create subject / deck / flashcards panels. */
export function CreateFlowNotice({
  tone = "error",
  children,
  onClose,
  action,
  stage = false,
}: Props) {
  const meta = TONE[tone];
  const Icon = meta.Icon;
  const compact = tone === "success" || tone === "reject" || tone === "info";

  return (
    <Box
      role={tone === "error" || tone === "reject" ? "alert" : "status"}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 1 : 1.25,
        px: compact ? 1.4 : 1.5,
        py: compact ? 0.95 : 1.25,
        borderRadius: stage ? 2.5 : compact ? 999 : 2,
        border: "1px solid",
        borderColor: stage ? meta.stageBorder : meta.border,
        bgcolor: stage ? undefined : meta.bg,
        background: stage ? meta.stageBg : undefined,
        boxShadow: stage ? meta.stageGlow : undefined,
        backdropFilter: stage ? "blur(10px)" : undefined,
        WebkitBackdropFilter: stage ? "blur(10px)" : undefined,
      }}
    >
      <Icon
        sx={{
          fontSize: compact ? 18 : 20,
          color: stage ? meta.stageIcon : meta.icon,
          flexShrink: 0,
        }}
        aria-hidden
      />
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          minWidth: 0,
          lineHeight: 1.4,
          color: stage ? "var(--sp-ivory)" : "text.primary",
          fontSize: compact ? "0.8125rem" : undefined,
          fontWeight: 600,
          letterSpacing: stage ? "0.01em" : undefined,
        }}
      >
        {children}
      </Typography>
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
      {onClose ? (
        <IconButton
          size="small"
          aria-label="Dismiss"
          onClick={onClose}
          sx={{
            mr: -0.5,
            color: stage ? "rgba(232, 216, 199, 0.62)" : "text.secondary",
            "&:hover": {
              color: stage ? "var(--sp-ivory)" : "text.primary",
              bgcolor: stage ? "rgba(232, 216, 199, 0.08)" : undefined,
            },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      ) : null}
    </Box>
  );
}

type FadeProps = Props & {
  open: boolean;
};

/** Keeps the notice mounted through opacity + slide fade. */
export function CreateFlowNoticeFade({
  open,
  tone = "error",
  children,
  onClose,
  action,
  stage,
}: FadeProps) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [payload, setPayload] = useState({
    tone,
    children,
    onClose,
    action,
    stage,
  });

  useEffect(() => {
    if (open) {
      setPayload({ tone, children, onClose, action, stage });
      setMounted(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setShown(true));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), FADE_MS);
    return () => window.clearTimeout(t);
  }, [open, tone, children, onClose, action, stage]);

  if (!mounted) return null;

  return (
    <Box
      sx={{
        width: "100%",
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(-6px)",
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
      }}
    >
      <CreateFlowNotice
        tone={payload.tone}
        onClose={payload.onClose}
        action={payload.action}
        stage={payload.stage}
      >
        {payload.children}
      </CreateFlowNotice>
    </Box>
  );
}

/** Compact Undo control for stage notices. */
export function NoticeUndoButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      size="small"
      onClick={onClick}
      disabled={disabled}
      startIcon={<UndoRoundedIcon sx={{ fontSize: 15 }} />}
      sx={{
        minWidth: 0,
        px: 1.15,
        py: 0.3,
        gap: 0.25,
        borderRadius: 999,
        textTransform: "none",
        fontWeight: 700,
        fontSize: "0.75rem",
        letterSpacing: "0.02em",
        color: "var(--sp-ivory)",
        border: "1px solid",
        borderColor: "rgba(232, 216, 199, 0.42)",
        bgcolor: "rgba(18, 7, 15, 0.42)",
        "& .MuiButton-startIcon": { mr: 0.35 },
        "&:hover": {
          bgcolor: "rgba(18, 7, 15, 0.62)",
          borderColor: "rgba(232, 216, 199, 0.62)",
        },
        "&.Mui-disabled": {
          color: "rgba(232, 216, 199, 0.4)",
          borderColor: "rgba(232, 216, 199, 0.2)",
        },
      }}
    >
      Undo
    </Button>
  );
}
