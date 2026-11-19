import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { FlipCardPlate } from "../components/CardFace";
import { FACE_BODY_SX, FACE_PROMPT_TEXT_SX } from "../components/studyFaceSx";
import { HOME_DEMO_BACK, HOME_DEMO_FRONT } from "./homeCopy";

/** Static demo flashcard for the public foyer (click to flip). */
export default function HomeFoyerCardPreview() {
  const [revealed, setRevealed] = useState(false);

  return (
    <Box
      data-foyer-card-preview
      sx={{
        width: "100%",
        maxWidth: 260,
        mx: "auto",
        // StudyCardPlate sizes with height:100%; indefinite parent collapses the plate to 0.
        aspectRatio: "var(--sp-card-aspect)",
        maxHeight: 340,
      }}
    >
      <FlipCardPlate
        revealed={revealed}
        onPlateClick={() => setRevealed((v) => !v)}
        plateSx={{
          width: "100%",
          height: "100%",
          maxHeight: "100%",
          cursor: "pointer",
        }}
        front={
          <Box data-card-face-content sx={FACE_BODY_SX}>
            <Typography component="p" sx={{ ...FACE_PROMPT_TEXT_SX, m: 0 }}>
              {HOME_DEMO_FRONT}
            </Typography>
            <Typography
              variant="caption"
              sx={{ mt: "auto", opacity: 0.55, textAlign: "center" }}
            >
              Tap to flip
            </Typography>
          </Box>
        }
        back={
          <Box data-card-face-content sx={FACE_BODY_SX}>
            <Typography component="p" sx={{ ...FACE_PROMPT_TEXT_SX, m: 0 }}>
              {HOME_DEMO_BACK}
            </Typography>
            <Typography
              variant="caption"
              sx={{ mt: "auto", opacity: 0.55, textAlign: "center" }}
            >
              Tap to flip back
            </Typography>
          </Box>
        }
      />
    </Box>
  );
}
