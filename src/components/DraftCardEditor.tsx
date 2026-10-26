import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import type { CardDraftView } from "../api/client";

export type DraftCardEditorProps = {
  card: CardDraftView;
  disabled?: boolean;
  onChange: (next: Pick<CardDraftView, "front" | "back" | "type">) => void;
};

/** Edit front / back / type for a draft card before accept. */
export default function DraftCardEditor({
  card,
  disabled = false,
  onChange,
}: DraftCardEditorProps) {
  return (
    <Stack spacing={2}>
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
              type: e.target.value as "qa" | "cloze",
            })
          }
        >
          <MenuItem value="qa">Q&A</MenuItem>
          <MenuItem value="cloze">Cloze</MenuItem>
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
