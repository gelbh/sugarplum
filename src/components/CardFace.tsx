import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { mediaUrl } from "../api/client";

type Props = {
  front: string;
  back: string;
  revealed: boolean;
  onReveal: () => void;
  disabled?: boolean;
  mediaR2Keys?: string[];
};

/** Front (and optional back) of a study card. */
export default function CardFace({
  front,
  back,
  revealed,
  onReveal,
  disabled,
  mediaR2Keys = [],
}: Props) {
  const imageKey = mediaR2Keys[0];

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      {imageKey ? (
        <Box
          component="img"
          src={mediaUrl(imageKey)}
          alt="Card media"
          sx={{
            display: "block",
            width: "100%",
            maxHeight: "40vh",
            objectFit: "contain",
            mb: 2,
            borderRadius: 1,
          }}
        />
      ) : null}
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
