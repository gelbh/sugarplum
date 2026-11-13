import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { MouseEvent } from "react";
import { ANATOMY_CATALOG } from "../anatomy/catalog";
import { anatomySceneHref } from "../anatomy/paths";
import { isPlainClick, navigate } from "../nav/navigate";

export default function AnatomyHub() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 5 } }}>
      <Stack spacing={2}>
        <Box>
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 600 }}
          >
            Anatomy
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Interactive 3D osteology scenes.
          </Typography>
        </Box>
        <List>
          {ANATOMY_CATALOG.map((entry) => (
            <ListItemButton
              key={entry.id}
              component={Link}
              href={anatomySceneHref(entry.id)}
              underline="none"
              color="inherit"
              onClick={(ev: MouseEvent<HTMLAnchorElement>) => {
                if (!isPlainClick(ev)) return;
                ev.preventDefault();
                navigate(anatomySceneHref(entry.id));
              }}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemText primary={entry.title} />
              {entry.standIn ? (
                <Chip size="small" label="stand-in" sx={{ ml: 1 }} />
              ) : null}
            </ListItemButton>
          ))}
        </List>
      </Stack>
    </Container>
  );
}
