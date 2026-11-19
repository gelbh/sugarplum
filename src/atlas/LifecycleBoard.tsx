import { type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import AtlasImage from "./AtlasImage";
import { atlasStageTitleSx } from "./atlasOperateSx";
import { termLabel } from "./filter";
import { durationLabel, stageIsDiagnostic } from "./lifecycle";
import { lifecyclePanelImage } from "./lifecyclePanelImage";
import LifecycleSwimlane from "./LifecycleSwimlane";
import type { AtlasImageView, DatasetFields } from "./types";

type Props = {
  fields: DatasetFields;
  images?: AtlasImageView[];
  onEditLifecycle?: () => void;
};

export default function LifecycleBoard({
  fields,
  images = [],
  onEditLifecycle,
}: Props) {
  return (
    <LifecycleSwimlane
      fields={fields}
      afterBoard={({ current, index, stages, transport }) => (
        <SelectedStagePanel
          stage={current}
          index={index}
          total={stages.length}
          image={lifecyclePanelImage(images, current.imageId)}
          transport={transport}
          onEdit={onEditLifecycle}
        />
      )}
    />
  );
}

function SelectedStagePanel({
  stage,
  index,
  total,
  image,
  transport,
  onEdit,
}: {
  stage: DatasetFields["lifecycleStages"][number];
  index: number;
  total: number;
  image: AtlasImageView | null;
  transport: ReactNode;
  onEdit?: () => void;
}) {
  const diagnostic = stageIsDiagnostic(stage);
  const diagram = image?.role === "lifecycle_diagram";
  return (
    <Box
      sx={{
        mt: 1.25,
        pt: 1.5,
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 1.5,
          flexWrap: "wrap",
        }}
      >
        <Typography
          aria-live="polite"
          sx={{ ...atlasStageTitleSx, position: "relative" }}
        >
          {termLabel(stage.name)}
          <Box
            component="span"
            sx={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            {` ${index + 1} of ${total}`}
          </Box>
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            ml: "auto",
          }}
        >
          <Typography
            aria-hidden
            color="text.secondary"
            sx={{
              fontSize: "0.78rem",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {index + 1} / {total}
          </Typography>
          {transport}
          {onEdit ? (
            <Button
              size="small"
              onClick={onEdit}
              sx={{ textTransform: "none", color: "text.secondary" }}
            >
              Edit lifecycle
            </Button>
          ) : null}
        </Box>
      </Box>

      <Box
        key={index}
        sx={{
          mt: 1.25,
          display: "grid",
          gridTemplateColumns: image
            ? { xs: "1fr", sm: diagram ? "1fr 200px" : "1fr 112px" }
            : "1fr",
          gap: 1.5,
          alignItems: "start",
          "@keyframes lifecycleStageIn": {
            from: { opacity: 0.35 },
            to: { opacity: 1 },
          },
          animation: "lifecycleStageIn 220ms ease-out",
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        <Box>
          {(stage.infective || diagnostic) && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 1 }}>
              {stage.infective ? (
                <Chip
                  size="small"
                  label="Infective"
                  color="primary"
                  sx={{ height: 22, fontSize: "0.72rem" }}
                />
              ) : null}
              {diagnostic ? (
                <Chip
                  size="small"
                  label="Diagnostic"
                  variant="outlined"
                  color="secondary"
                  sx={{ height: 22, fontSize: "0.72rem" }}
                />
              ) : null}
            </Box>
          )}
          {stage.location ? (
            <Typography sx={{ fontSize: "0.95rem", lineHeight: 1.55 }}>
              {stage.location}
            </Typography>
          ) : null}
          {(stage.durationDays || stage.host) && (
            <Typography
              color="text.secondary"
              sx={{ mt: 0.55, fontSize: "0.82rem", lineHeight: 1.4 }}
            >
              {[
                stage.durationDays ? durationLabel(stage.durationDays) : null,
                stage.host ? termLabel(stage.host) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
          )}
          {stage.note ? (
            <Typography
              color="text.secondary"
              sx={{ mt: 0.85, fontSize: "0.88rem", lineHeight: 1.45 }}
            >
              {stage.note}
            </Typography>
          ) : null}
          {stage.transmission ? (
            <Typography
              color="text.secondary"
              sx={{ mt: 0.65, fontSize: "0.84rem", lineHeight: 1.45 }}
            >
              Arrives via {stage.transmission}
            </Typography>
          ) : null}
        </Box>
        {image ? (
          <AtlasImage
            image={image}
            ratio={diagram ? "16 / 10" : "1"}
            compact
            sx={{ borderRadius: 2 }}
          />
        ) : null}
      </Box>
    </Box>
  );
}
