import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import geography from "world-atlas/countries-110m.json";
import {
  countryHeatWeight,
  heatFill,
  heatOpacity,
} from "./distributionHeat";
import type { DistributionMeta } from "./distributionTags";

type Props = {
  id: string;
  meta: DistributionMeta;
  ariaLabel: string;
};

/** Country choropleth from structured distribution fields. */
export default function DistributionMap({ id, meta, ariaLabel }: Props) {
  const theme = useTheme();
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
    <Box
      id={id}
      role="img"
      aria-label={ariaLabel}
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
  );
}
