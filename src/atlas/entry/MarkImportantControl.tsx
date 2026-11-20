import { useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ApiError } from "../../api/client";
import { patchEntryFocus } from "../hub/apiSource";
import type { AtlasEntryView } from "../types";

type Props = {
  atlasId: string;
  entry: AtlasEntryView;
  onUpdated: (entry: AtlasEntryView) => void;
  size?: "small" | "medium";
};

export default function MarkImportantControl({
  atlasId,
  entry,
  onUpdated,
  size = "small",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinnedKey = entry.override === "key";

  async function run(override: "key" | null) {
    setBusy(true);
    setError(null);
    try {
      const next = await patchEntryFocus(atlasId, entry.id, override);
      onUpdated(next);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update Focus",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={0.5} sx={{
      alignItems: "flex-start"
    }}>
      {pinnedKey ? (
        <Button
          size={size}
          variant="outlined"
          disabled={busy}
          onClick={() => void run(null)}
        >
          Clear mark
        </Button>
      ) : (
        <Button
          size={size}
          variant="outlined"
          disabled={busy}
          onClick={() => void run("key")}
        >
          Mark as important
        </Button>
      )}
      {error ? (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      ) : null}
    </Stack>
  );
}
