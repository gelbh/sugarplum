import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

const MAGNIFIC_URL = "https://www.magnific.com";

/** Fruit medal artwork attribution (vector4stock on Magnific). */
export default function MagnificCredits() {
  return (
    <Typography variant="caption" color="text.secondary" component="p">
      Fruit medals{" "}
      <Link
        href={MAGNIFIC_URL}
        target="_blank"
        rel="noopener noreferrer"
        underline="hover"
        color="inherit"
      >
        designed by vector4stock - Magnific.com
      </Link>
    </Typography>
  );
}
