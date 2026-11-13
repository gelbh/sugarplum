import AgricultureOutlinedIcon from "@mui/icons-material/AgricultureOutlined";
import PetsOutlinedIcon from "@mui/icons-material/PetsOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { MouseEvent, ReactNode } from "react";
import { ANATOMY_CATALOG } from "../anatomy/catalog";
import { anatomySceneHref } from "../anatomy/paths";
import { atlasHubHref } from "../atlas/paths";
import { isPlainClick, navigate } from "../nav/navigate";

/** Decorative only; titles carry the species name. */
const SPECIES_ICON: Record<string, ReactNode> = {
  canine: <PetsOutlinedIcon aria-hidden />,
  equine: <ViewInArOutlinedIcon aria-hidden />,
  bovine: <AgricultureOutlinedIcon aria-hidden />,
};

export default function AnatomyHub() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 5 } }}>
      <Stack spacing={3}>
        <Box>
          <Link
            href={atlasHubHref()}
            underline="hover"
            variant="body2"
            color="text.secondary"
            onClick={(ev: MouseEvent<HTMLAnchorElement>) => {
              if (!isPlainClick(ev)) return;
              ev.preventDefault();
              navigate(atlasHubHref());
            }}
            sx={{ display: "inline-block", mb: 1 }}
          >
            Atlas
          </Link>
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
        <Stack spacing={1.5}>
          {ANATOMY_CATALOG.map((entry) => (
            <ButtonBase
              key={entry.id}
              focusRipple
              href={anatomySceneHref(entry.id)}
              onClick={(ev: MouseEvent<HTMLAnchorElement>) => {
                if (!isPlainClick(ev)) return;
                ev.preventDefault();
                navigate(anatomySceneHref(entry.id));
              }}
              sx={{
                display: "block",
                width: "100%",
                textAlign: "left",
                borderRadius: 1,
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                px: 2.5,
                py: 2,
                transition:
                  "border-color 160ms ease-out, background-color 160ms ease-out, transform 160ms ease-out",
                "&:hover": {
                  borderColor: "primary.main",
                  bgcolor: "action.hover",
                },
                "&.Mui-focusVisible": {
                  outline: "2px solid",
                  outlineColor: "primary.main",
                  outlineOffset: 2,
                },
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    color: "primary.main",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 0,
                    flexShrink: 0,
                    "& .MuiSvgIcon-root": { fontSize: 28 },
                  }}
                >
                  {SPECIES_ICON[entry.id] ?? (
                    <ViewInArOutlinedIcon aria-hidden />
                  )}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    component="h2"
                    variant="h6"
                    sx={{ fontWeight: 600 }}
                  >
                    {entry.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
                    Region-staged whole-animal osteology
                  </Typography>
                </Box>
              </Stack>
            </ButtonBase>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
