import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { termLabel } from "../lib/labels";
import { stageIsDiagnostic } from "./lifecycle";
import { lifecyclePanelImage } from "./lifecyclePanelImage";
import SelectedStagePanel from "./SelectedStagePanel";
import type { AtlasImageView, DatasetFields } from "../types";

type Props = {
  fields: DatasetFields;
  images?: AtlasImageView[];
  onEditLifecycle?: () => void;
};

export default function LifecycleVertical({
  fields,
  images = [],
  onEditLifecycle,
}: Props) {
  const stages = fields.lifecycleStages;
  const [index, setIndex] = useState(0);
  const detailRef = useRef<HTMLDivElement>(null);
  const safeIndex =
    stages.length === 0 ? 0 : Math.min(index, stages.length - 1);
  const current = stages[safeIndex];

  useEffect(() => {
    const el = detailRef.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [safeIndex]);

  if (!current) {
    return (
      <Typography sx={{ color: "text.secondary" }}>
        No lifecycle stages recorded yet.
      </Typography>
    );
  }

  const transport = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
      <IconButton
        onClick={() => setIndex((i) => Math.max(0, i - 1))}
        disabled={safeIndex === 0}
        aria-label="Previous stage"
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
      <IconButton
        onClick={() => setIndex((i) => Math.min(stages.length - 1, i + 1))}
        disabled={safeIndex >= stages.length - 1}
        aria-label="Next stage"
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        <ChevronRightIcon fontSize="small" />
      </IconButton>
    </Box>
  );

  return (
    <Box>
      <Box
        component="ul"
        aria-label="Lifecycle stages"
        sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}
      >
        {stages.map((stage, i) => {
          const diagnostic = stageIsDiagnostic(stage);
          const selected = i === safeIndex;
          return (
            <Box component="li" key={`${stage.name}-${i}`}>
              <Button
                fullWidth
                variant={selected ? "contained" : "outlined"}
                onClick={() => setIndex(i)}
                aria-current={selected ? "step" : undefined}
                sx={{
                  justifyContent: "flex-start",
                  textTransform: "none",
                  minHeight: 44,
                  px: 1.5,
                  py: 1,
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Typography component="span" sx={{ fontWeight: 600, flex: 1 }}>
                  {termLabel(stage.name)}
                </Typography>
                {stage.hostRole ? (
                  <Chip
                    size="small"
                    label={termLabel(stage.hostRole)}
                    sx={{ height: 22, fontSize: "0.72rem" }}
                  />
                ) : null}
                {stage.infective ? (
                  <Chip
                    size="small"
                    label="Infective"
                    color={selected ? "default" : "primary"}
                    sx={{ height: 22, fontSize: "0.72rem" }}
                  />
                ) : null}
                {diagnostic ? (
                  <Chip
                    size="small"
                    label="Diagnostic"
                    variant="outlined"
                    color={selected ? "default" : "secondary"}
                    sx={{ height: 22, fontSize: "0.72rem" }}
                  />
                ) : null}
              </Button>
              {selected ? (
                <Box ref={detailRef}>
                  <SelectedStagePanel
                    stage={current}
                    index={safeIndex}
                    total={stages.length}
                    image={lifecyclePanelImage(images, current.imageId)}
                    transport={transport}
                    onEdit={onEditLifecycle}
                  />
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
