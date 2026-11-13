import { useEffect, useMemo, useReducer, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { MouseEvent } from "react";
import AnatomyCanvas from "../anatomy/AnatomyCanvas";
import { parseAnatomySceneManifest } from "../anatomy/parseScene";
import { anatomyHubHref } from "../anatomy/paths";
import StructurePanel from "../anatomy/StructurePanel";
import {
  createStructureUiState,
  structureUiReducer,
} from "../anatomy/structureState";
import type { AnatomySceneManifest } from "../anatomy/types";
import { isPlainClick, navigate } from "../nav/navigate";

type Props = { sceneId: string };

export default function AnatomyViewerPage({ sceneId }: Props) {
  const [manifest, setManifest] = useState<AnatomySceneManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ui, dispatch] = useReducer(
    structureUiReducer,
    undefined,
    createStructureUiState,
  );
  const [viewEpoch, setViewEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setManifest(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/anatomy/${encodeURIComponent(sceneId)}/scene.json`);
        if (!res.ok) throw new Error(`Could not load scene (${res.status})`);
        const json: unknown = await res.json();
        const parsed = parseAnatomySceneManifest(json);
        if (parsed.id !== sceneId) {
          throw new Error("Scene id mismatch");
        }
        if (!cancelled) setManifest(parsed);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load scene");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  const assetUrl = useMemo(() => {
    if (!manifest) return null;
    const base = `/anatomy/${encodeURIComponent(sceneId)}/`;
    const asset = manifest.asset.replace(/^\.\//, "");
    return `${base}${asset}`;
  }, [manifest, sceneId]);

  const selectedLabel =
    manifest?.structures.find((s) => s.id === ui.selectedId)?.label ?? null;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Box>
          <Link
            href={anatomyHubHref()}
            underline="hover"
            onClick={(ev: MouseEvent<HTMLAnchorElement>) => {
              if (!isPlainClick(ev)) return;
              ev.preventDefault();
              navigate(anatomyHubHref());
            }}
          >
            Back to Anatomy
          </Link>
          <Typography variant="h5" component="h1" sx={{ mt: 1, fontWeight: 600 }}>
            {manifest?.title ?? sceneId}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            {selectedLabel ? (
              <Chip label={selectedLabel} size="small" />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Click a structure in the list or on the model.
              </Typography>
            )}
            {manifest ? (
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={() => setViewEpoch((n) => n + 1)}
              >
                Reset view
              </Link>
            ) : null}
          </Stack>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}

        {manifest && assetUrl ? (
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems="stretch"
            sx={{ minHeight: { md: 480 } }}
          >
            <StructurePanel
              structures={manifest.structures}
              ui={ui}
              dispatch={dispatch}
            />
            <Box sx={{ flex: 1, minHeight: 360 }}>
              <AnatomyCanvas
                key={`${assetUrl}:${viewEpoch}`}
                assetUrl={assetUrl}
                structures={manifest.structures}
                ui={ui}
                onSelect={(id) => dispatch({ type: "select", id })}
              />
            </Box>
          </Stack>
        ) : !error ? (
          <Typography color="text.secondary">Loading scene…</Typography>
        ) : null}
      </Stack>
    </Container>
  );
}
