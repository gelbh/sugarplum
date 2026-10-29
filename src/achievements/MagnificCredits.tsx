import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

const MAGNIFIC_URL = "https://www.magnific.com";

/** Fruit medal artwork attribution (vector4stock on Magnific). */
export default function MagnificCredits() {
  return (
    <Typography variant="caption" color="text.secondary" component="p">
      Fruit medals designed by{" "}
      <Link
        href={MAGNIFIC_URL}
        target="_blank"
        rel="noopener noreferrer"
        underline="hover"
        color="inherit"
      >
        vector4stock
      </Link>{" "}
      on Magnific.com
    </Typography>
  );
}
