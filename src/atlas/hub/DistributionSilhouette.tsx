import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { lazy, Suspense, useId, useState } from "react";
import {
  distributionChipLabels,
  metaFromFields,
  type DistributionMeta,
} from "./distributionTags";
import { readMapOpen, writeMapOpen } from "./mapOpenPref";

const DistributionMap = lazy(() => import("./DistributionMap"));

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
    const next = !open;
    writeMapOpen(next);
    setOpen(next);
  };
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
        aria-controls={open ? mapId : undefined}
        sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}
      >
        {open ? "Hide map" : "Show map"}
      </Button>
      {open ? (
        <Suspense fallback={null}>
          <DistributionMap
            id={mapId}
            meta={meta}
            ariaLabel={
              chips.length
                ? `Distribution map highlighting ${chips.join(", ")}`
                : "Distribution map"
            }
          />
        </Suspense>
      ) : null}
    </Box>
  );
}
