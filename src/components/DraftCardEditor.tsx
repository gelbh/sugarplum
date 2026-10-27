import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { mediaUrl, type CardDraftView } from "../api/client";

export type DraftCardEditorProps = {
  card: CardDraftView;
  disabled?: boolean;
  onChange: (next: Pick<CardDraftView, "front" | "back" | "type">) => void;
};

type CardType = "qa" | "cloze" | "image_label" | "diagram";

/** Edit front / back / type for a draft card before accept. */
export default function DraftCardEditor({
  card,
  disabled = false,
  onChange,
}: DraftCardEditorProps) {
  const imageKey = card.media_r2_keys?.[0];

  return (
    <Stack spacing={2}>
      {imageKey ? (
        <Box
          component="img"
          src={mediaUrl(imageKey)}
          alt="Draft media"
          sx={{
            display: "block",
            width: "100%",
            maxHeight: "40vh",
            objectFit: "contain",
            borderRadius: 1,
          }}
        />
      ) : null}
      <FormControl fullWidth size="small" disabled={disabled}>
        <InputLabel id={`card-type-${card.id}`}>Type</InputLabel>
        <Select
          labelId={`card-type-${card.id}`}
          label="Type"
          value={card.type}
          onChange={(e) =>
            onChange({
              front: card.front,
              back: card.back,
              type: e.target.value as CardType,
            })
          }
        >
          <MenuItem value="qa">Q&A</MenuItem>
          <MenuItem value="cloze">Cloze</MenuItem>
          <MenuItem value="image_label">Image label</MenuItem>
          <MenuItem value="diagram">Diagram</MenuItem>
        </Select>
      </FormControl>
      <TextField
        label={card.type === "cloze" ? "Front (one blank)" : "Front"}
        value={card.front}
        onChange={(e) =>
          onChange({
            front: e.target.value,
            back: card.back,
            type: card.type,
          })
        }
        multiline
        minRows={2}
        fullWidth
        disabled={disabled}
      />
      <TextField
        label="Back"
        value={card.back}
        onChange={(e) =>
          onChange({
            front: card.front,
            back: e.target.value,
            type: card.type,
          })
        }
        multiline
        minRows={2}
        fullWidth
        disabled={disabled}
      />
    </Stack>
  );
}
