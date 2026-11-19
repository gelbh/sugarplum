import type { MouseEvent, ReactNode } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type Props = {
  title: string;
  blurb: string;
  icon: ReactNode;
  href?: string;
  onClick: (ev: MouseEvent) => void;
  /** `tile`: side-by-side hub cards. `list`: full-width stacked catalog. */
  layout?: "tile" | "list";
};

export default function HubNavCard({
  title,
  blurb,
  icon,
  href,
  onClick,
  layout = "tile",
}: Props) {
  const isList = layout === "list";
  return (
    <ButtonBase
      focusRipple
      {...(href ? { href } : {})}
      onClick={onClick}
      sx={{
        display: "block",
        textAlign: "left",
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        px: 2.5,
        py: isList ? 2 : 2.5,
        width: isList ? "100%" : undefined,
        flex: isList ? undefined : 1,
        transition: isList
          ? "border-color 160ms ease-out, background-color 160ms ease-out, transform 160ms ease-out"
          : "border-color 160ms ease-out, background-color 160ms ease-out",
        "&:hover": {
          borderColor: "primary.main",
          bgcolor: "action.hover",
        },
        "&.Mui-focusVisible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{
        alignItems: "center"
      }}>
        <Box
          sx={{
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 0,
            flexShrink: 0,
            "& .MuiSvgIcon-root": { fontSize: 28 },
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: isList ? 0.5 : 0.75
            }}>
            {blurb}
          </Typography>
        </Box>
      </Stack>
    </ButtonBase>
  );
}
