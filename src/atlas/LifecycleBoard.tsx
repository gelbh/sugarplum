import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import AtlasImage from "./AtlasImage";
import { termLabel } from "./filter";
import { durationLabel, stageIsDiagnostic } from "./lifecycle";
import { lifecyclePanelImage } from "./lifecyclePanelImage";
import LifecycleSwimlane from "./LifecycleSwimlane";
import type { AtlasImageView, DatasetFields } from "./types";

type Props = {
  fields: DatasetFields;
  images?: AtlasImageView[];
  onCiteLifecycle?: () => void;
  onEditLifecycle?: () => void;
};

export default function LifecycleBoard({
  fields,
  images = [],
  onCiteLifecycle,
  onEditLifecycle,
}: Props) {
  return (
    <LifecycleSwimlane
      fields={fields}
      afterTimeline={({ current, index, stages }) => (
        <SelectedStagePanel
          stage={current}
          index={index}
          total={stages.length}
          image={lifecyclePanelImage(images, current.imageId)}
          onCite={onCiteLifecycle}
          onEdit={onEditLifecycle}
        />
      )}
      afterControls={({ stages, index, setIndex, setPlaying }) => (
        <StepList
          stages={stages}
          index={index}
          onPick={(i) => {
            setPlaying(false);
            setIndex(i);
          }}
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
  onCite,
  onEdit,
}: {
  stage: DatasetFields["lifecycleStages"][number];
  index: number;
  total: number;
  image: AtlasImageView | null;
  onCite?: () => void;
  onEdit?: () => void;
}) {
  const diagnostic = stageIsDiagnostic(stage);
  const diagram = image?.role === "lifecycle_diagram";
  return (
    <Box
      sx={{
        mt: 2,
        p: 1.75,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        display: "grid",
        gridTemplateColumns: image
          ? { xs: "1fr", sm: diagram ? "1fr 200px" : "1fr 112px" }
          : "1fr",
        gap: 1.5,
        alignItems: "start",
      }}
    >
      <Box>
        <Typography
          aria-live="polite"
          sx={{ fontSize: "0.92rem", fontWeight: 600 }}
        >
          Now, step {index + 1} of {total}: {termLabel(stage.name)}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: "0.86rem" }}>
          {[
            stage.location,
            stage.durationDays ? durationLabel(stage.durationDays) : null,
            stage.host ? termLabel(stage.host) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
        {stage.note ? (
          <Typography sx={{ mt: 1, fontSize: "0.9rem" }}>{stage.note}</Typography>
        ) : null}
        {stage.transmission ? (
          <Typography
            color="text.secondary"
            sx={{ mt: 0.75, fontSize: "0.84rem" }}
          >
            Arrives via: {stage.transmission}
          </Typography>
        ) : null}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
          {stage.infective ? (
            <Chip size="small" label="Infective" color="primary" />
          ) : null}
          {diagnostic ? (
            <Chip
              size="small"
              label="Diagnostic"
              variant="outlined"
              color="primary"
            />
          ) : null}
          {onCite ? (
            <Button size="small" onClick={onCite}>
              Cite
            </Button>
          ) : null}
          {onEdit ? (
            <Button size="small" variant="outlined" onClick={onEdit}>
              Edit lifecycle
            </Button>
          ) : null}
        </Box>
      </Box>
      {image ? (
        <AtlasImage
          image={image}
          ratio={diagram ? "16 / 10" : "1"}
          compact
          sx={{ borderRadius: 1 }}
        />
      ) : null}
    </Box>
  );
}

function StepList({
  stages,
  index,
  onPick,
}: {
  stages: DatasetFields["lifecycleStages"];
  index: number;
  onPick: (i: number) => void;
}) {
  return (
    <Box
      component="ol"
      aria-label="Lifecycle stages"
      sx={{
        listStyle: "none",
        p: 0,
        m: 0,
        mt: 2,
        display: "grid",
        // Balanced rows: 8 stages read as 4 + 4, not 5 + 3.
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: `repeat(${Math.ceil(
            stages.length / Math.ceil(stages.length / 5),
          )}, minmax(0, 1fr))`,
        },
        gap: 1,
      }}
    >
      {stages.map((s, i) => (
        <li key={`${s.name}-${i}`}>
          <ButtonBase
            onClick={() => onPick(i)}
            aria-current={i === index ? "step" : undefined}
            sx={{
              width: "100%",
              height: "100%",
              display: "block",
              position: "relative",
              textAlign: "left",
              px: 1.5,
              py: 1.25,
              borderRadius: 1.5,
              border: 1,
              borderColor: "divider",
              color: "text.secondary",
              fontSize: "0.84rem",
              lineHeight: 1.35,
            }}
          >
            <Box
              aria-hidden
              sx={{
                position: "absolute",
                inset: -1,
                borderRadius: 1.5,
                border: 1,
                borderColor: "primary.main",
                bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
                opacity: i === index ? 1 : 0,
                transition: "opacity 180ms ease",
                pointerEvents: "none",
                "@media (prefers-reduced-motion: reduce)": {
                  transition: "none",
                },
              }}
            />
            <Box
              component="b"
              sx={{
                display: "block",
                position: "relative",
                fontSize: "0.74rem",
                color: i === index ? "primary.main" : "text.secondary",
              }}
            >
              {i + 1}
            </Box>
            <Box
              component="span"
              sx={{
                position: "relative",
                fontWeight: 600,
                color: "text.primary",
              }}
            >
              {termLabel(s.name)}
            </Box>
            {s.location ? (
              <Box component="span" sx={{ position: "relative" }}>
                , {s.location}
              </Box>
            ) : null}
          </ButtonBase>
        </li>
      ))}
    </Box>
  );
}
