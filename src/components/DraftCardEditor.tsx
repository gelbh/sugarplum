import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { mediaUrl, type CardDraftView } from "../api/client";
import {
  blankClozeFront,
  extractClozeAnswer,
} from "../lib/clozeFormat";

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
  const isCloze = card.type === "cloze";
  const clozeAnswer = isCloze
    ? (extractClozeAnswer(card.front) ?? (card.back.trim() || null))
    : null;

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
          <MenuItem value="cloze">Fill in the blank</MenuItem>
          <MenuItem value="image_label">Image label</MenuItem>
          <MenuItem value="diagram">Diagram</MenuItem>
        </Select>
      </FormControl>

      {isCloze ? (
        <>
          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              bgcolor: "action.hover",
              border: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              How it will look when you study
            </Typography>
            <Typography
              component="p"
              variant="body1"
              sx={{ whiteSpace: "pre-wrap", mb: clozeAnswer ? 1.5 : 0 }}
            >
              {blankClozeFront(card.front)}
            </Typography>
            {clozeAnswer ? (
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                <Typography variant="caption" color="text.secondary">
                  Answer:
                </Typography>
                <Chip size="small" label={clozeAnswer} color="primary" variant="outlined" />
              </Stack>
            ) : null}
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
              Blanks show as […] when you study
            </Typography>
          </Box>

          <Accordion
            disableGutters
            elevation={0}
            sx={{
              "&:before": { display: "none" },
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="edit-text-content">
              <Typography variant="body2" fontWeight={500}>
                Edit text
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Stack spacing={2}>
                <TextField
                  label="Front (sentence with blank markup)"
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
                  helperText="Advanced: keep the generated blank markers if you edit wording."
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
            </AccordionDetails>
          </Accordion>
        </>
      ) : (
        <>
          <TextField
            label="Front"
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
        </>
      )}
    </Stack>
  );
}
