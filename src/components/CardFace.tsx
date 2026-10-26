import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

type Props = {
  front: string;
  back: string;
  revealed: boolean;
  onReveal: () => void;
  disabled?: boolean;
};

/** Front (and optional back) of a study card. */
export default function CardFace({
  front,
  back,
  revealed,
  onReveal,
  disabled,
}: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="overline" color="text.secondary">
        Front
      </Typography>
      <Typography variant="h5" component="p" sx={{ whiteSpace: "pre-wrap", mb: 2 }}>
        {front}
      </Typography>

      {revealed ? (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="overline" color="text.secondary">
            Back
          </Typography>
          <Typography
            variant="body1"
            sx={{ whiteSpace: "pre-wrap", color: "secondary.main" }}
          >
            {back}
          </Typography>
        </>
      ) : (
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={onReveal} disabled={disabled}>
            Show answer
          </Button>
        </Box>
      )}
    </Paper>
  );
}
