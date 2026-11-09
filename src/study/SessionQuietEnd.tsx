import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export type SessionQuietEndProps = {
  canStudyMore: boolean;
  studyMoreBusy: boolean;
  onStudyMore: () => void;
  onToday: () => void;
  scopeBack: { href: string; label: string; onClick: () => void } | null;
};

export default function SessionQuietEnd(props: SessionQuietEndProps) {
  return (
    <Stack spacing={1.5} alignItems="stretch">
      <Typography variant="body1" sx={{ textAlign: "center" }}>
        No cards left for now.
      </Typography>
      <Button variant="contained" onClick={props.onToday}>
        Today
      </Button>
      {props.canStudyMore ? (
        <Button
          variant="outlined"
          disabled={props.studyMoreBusy}
          onClick={props.onStudyMore}
        >
          {props.studyMoreBusy ? "Loading…" : "Study more"}
        </Button>
      ) : null}
      {props.scopeBack ? (
        <Link
          href={props.scopeBack.href}
          underline="hover"
          onClick={(ev) => {
            ev.preventDefault();
            props.scopeBack!.onClick();
          }}
        >
          {props.scopeBack.label}
        </Link>
      ) : null}
    </Stack>
  );
}
