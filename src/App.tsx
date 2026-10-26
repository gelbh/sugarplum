import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

export default function App() {
  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h3" component="h1" gutterBottom color="primary">
        Sugarplum
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Spaced-repetition study shell. More surfaces land in later tasks.
      </Typography>
    </Container>
  );
}
