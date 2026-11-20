import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { useId, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import geography from "world-atlas/countries-110m.json";
import {
  countryHeatWeight,
  heatFill,
  heatOpacity,
} from "./distributionHeat";
import {
  distributionChipLabels,
  metaFromFields,
  type DistributionMeta,
} from "./distributionTags";
import { readMapOpen, writeMapOpen } from "./mapOpenPref";

type Props = {
  text: string;
  meta?: DistributionMeta;
  worldwide?: boolean;
  regions?: DistributionMeta["regions"];
  bands?: DistributionMeta["bands"];
};

/** Country choropleth from structured distribution fields; prose is caption. */
export default function DistributionSilhouette({
  text,
  meta: metaProp,
  worldwide,
  regions,
  bands,
}: Props) {
  const theme = useTheme();
  const meta =
    metaProp ??
    metaFromFields({
      distribution: text,
      distributionWorldwide: worldwide,
      distributionRegions: regions,
      climateBands: bands,
    });
  const chips = distributionChipLabels(meta);
  const [open, setOpen] = useState(readMapOpen);
  const mapId = useId();
  const toggleMap = () => {
    setOpen((prev) => {
      writeMapOpen(!prev);
      return !prev;
    });
  };
  // High-contrast ramp: grey silhouette vs amber endemic (theme warning).
  const mute =
    theme.palette.mode === "dark"
      ? theme.palette.grey[800]
      : theme.palette.grey[200];
  const soft = theme.palette.warning.light;
  const hot = theme.palette.warning.dark;
  const stroke =
    theme.palette.mode === "dark"
      ? theme.palette.grey[900]
      : theme.palette.common.white;

  return (
    <Box sx={{ mt: 0.75 }}>
      {chips.length ? (
        <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap" }}>
          {chips.map((label) => (
            <Chip
              key={label}
              label={label}
              size="small"
              variant="outlined"
              sx={{ height: 24, fontWeight: 600 }}
            />
          ))}
        </Stack>
      ) : null}
      <Typography sx={{ mt: 1, fontSize: "1.08rem", lineHeight: 1.45 }}>
        {text}
      </Typography>
      <Button
        size="small"
        onClick={toggleMap}
        aria-expanded={open}
        aria-controls={mapId}
        sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}
      >
        {open ? "Hide map" : "Show map"}
      </Button>
      {open ? (
        <Box
          id={mapId}
          role="img"
          aria-label={
            chips.length
              ? `Distribution map highlighting ${chips.join(", ")}`
              : "Distribution map"
          }
          sx={{
            mt: 0.75,
            borderRadius: 1.25,
            border: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            px: 0.5,
            py: 1,
            pointerEvents: "none",
            userSelect: "none",
            "& svg": { display: "block", width: "100%", height: "auto" },
            // Library defaults tabIndex=0 on each country; kill focus rings.
            "& .rsm-geography": {
              outline: "none",
              cursor: "default",
            },
            "& .rsm-geography:focus, & .rsm-geography:focus-visible": {
              outline: "none",
            },
          }}
        >
          {/* Equal Earth: choropleth-safe (area-honest). Mercator inflates poles. */}
          <ComposableMap
            projection="geoEqualEarth"
            projectionConfig={{ scale: 155 }}
            width={800}
            height={380}
            style={{ width: "100%", height: "auto" }}
          >
            {/* world-atlas JSON is TopoJSON; library accepts it at runtime. */}
            <Geographies geography={geography as never}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const id = String(geo.id ?? "");
                  const weight = countryHeatWeight(id, meta);
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      tabIndex={-1}
                      focusable="false"
                      fill={heatFill(weight, mute, soft, hot)}
                      stroke={stroke}
                      strokeWidth={0.4}
                      opacity={heatOpacity(weight)}
                      style={{ outline: "none", pointerEvents: "none" }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        </Box>
      ) : null}
    </Box>
  );
}
