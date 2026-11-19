import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type Action = {
  label: string;
  onClick: () => void;
};

type Props = {
  title: string;
  body: string;
  primary: Action;
  secondary?: Action;
};

export default function EmptyNext({
  title,
  body,
  primary,
  secondary,
}: Props) {
  return (
    <Stack
      spacing={1}
      sx={{
        alignItems: "center",
        textAlign: "center",
        py: 4,
        px: 2
      }}>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          maxWidth: 420
        }}>
        {body}
      </Typography>
      <Button
        variant="contained"
        onClick={primary.onClick}
        sx={{ mt: 1, minHeight: 48 }}
      >
        {primary.label}
      </Button>
      {secondary ? (
        <Button variant="text" onClick={secondary.onClick}>
          {secondary.label}
        </Button>
      ) : null}
    </Stack>
  );
}
