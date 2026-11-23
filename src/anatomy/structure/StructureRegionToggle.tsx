import type { ReactNode } from "react";
import DirectionsWalkOutlinedIcon from "@mui/icons-material/DirectionsWalkOutlined";
import FaceOutlinedIcon from "@mui/icons-material/FaceOutlined";
import FavoriteBorderOutlinedIcon from "@mui/icons-material/FavoriteBorderOutlined";
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { didacticColorFor } from "../didacticPalette";
import type { RegionDisplay } from "./regionDisplay";

function regionIcon(id: string): ReactNode {
  if (id.startsWith("legs-")) {
    return <DirectionsWalkOutlinedIcon aria-hidden />;
  }
  if (id === "skull") {
    return <FaceOutlinedIcon aria-hidden />;
  }
  if (id === "organs") {
    return <FavoriteBorderOutlinedIcon aria-hidden />;
  }
  if (id === "spine") {
    return <StraightenOutlinedIcon aria-hidden />;
  }
  return <ViewInArOutlinedIcon aria-hidden />;
}

export function StructureRegionToggle({
  display,
  active,
  onToggle,
}: {
  display: RegionDisplay;
  active: boolean;
  onToggle: () => void;
}) {
  const tint = didacticColorFor({ region: display.region.id });
  return (
    <ButtonBase
      focusRipple
      onClick={onToggle}
      aria-pressed={active}
      aria-label={display.region.label}
      sx={{
        display: "inline-flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 0.5,
        width: "100%",
        minHeight: 30,
        px: 0.75,
        py: 0,
        borderRadius: 1,
        border: 1,
        borderColor: active ? "primary.main" : "divider",
        bgcolor: active ? "primary.main" : "transparent",
        color: active ? "primary.contrastText" : "text.primary",
        textAlign: "left",
        transition:
          "background-color 160ms ease-out, border-color 160ms ease-out, color 160ms ease-out",
        "&:hover": {
          borderColor: "primary.main",
          bgcolor: active ? "primary.dark" : "action.hover",
        },
        "&.Mui-focusVisible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 1,
        },
        "& .MuiSvgIcon-root": {
          display: "block",
          fontSize: 15,
        },
      }}
    >
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          flexShrink: 0,
          opacity: active ? 1 : 0.85,
          position: "relative",
        }}
      >
        {regionIcon(display.region.id)}
        {tint ? (
          <Box
            component="span"
            aria-hidden
            sx={{
              position: "absolute",
              right: -2,
              bottom: -1,
              width: 7,
              height: 7,
              borderRadius: "50%",
              bgcolor: tint,
              border: "1px solid",
              borderColor: active ? "primary.contrastText" : "background.paper",
            }}
          />
        ) : null}
      </Box>
      <Typography
        variant="body2"
        component="span"
        sx={{
          fontWeight: active ? 600 : 500,
          lineHeight: 1,
          fontSize: "0.75rem",
        }}
      >
        {display.short}
      </Typography>
    </ButtonBase>
  );
}
