import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { CalendarSuggestion, Subject } from "../api/client";

type Props = {
  suggestions: CalendarSuggestion[];
  subjects: Subject[];
  busyKey: string | null;
  onAdd: (suggestion: CalendarSuggestion) => void;
  onLink: (suggestion: CalendarSuggestion, subjectId: string) => void;
  onDismiss: (suggestion: CalendarSuggestion) => void;
};

export default function CalendarSuggestionsPanel({
  suggestions,
  subjects,
  busyKey,
  onAdd,
  onLink,
  onDismiss,
}: Props) {
  if (suggestions.length === 0) return null;

  return (
    <Stack spacing={1.5}>
      {suggestions.map((suggestion) => {
        const linked = suggestion.linkSubjectId
          ? subjects.find((s) => s.id === suggestion.linkSubjectId)
          : null;
        const busy = busyKey === suggestion.clusterKey;
        return (
          <Stack
            key={suggestion.clusterKey}
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ sm: "center" }}
            sx={{
              p: 1.5,
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {linked
                  ? `Link ${suggestion.title} to ${linked.title}?`
                  : `Add ${suggestion.title}?`}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {suggestion.evidence}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="contained"
                disabled={busy}
                onClick={() => {
                  if (linked) onLink(suggestion, linked.id);
                  else onAdd(suggestion);
                }}
              >
                {linked ? "Link" : "Add"}
              </Button>
              <Button
                size="small"
                variant="text"
                disabled={busy}
                onClick={() => onDismiss(suggestion)}
              >
                Dismiss
              </Button>
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}
