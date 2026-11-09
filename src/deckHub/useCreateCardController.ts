import {
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import {
  ApiError,
  createDeckCard,
  resolveUploadContentType,
  uploadMaterialFile,
  type CardDraftView,
  type CardType,
} from "../api/client";
import type { DraftEditorChange } from "../components/DraftCardEditor";
import {
  isOcclusionFront,
  starterOcclusionFront,
} from "../lib/draftCardModel";
import {
  hubDiyTypes,
  validateHubCreateCard,
} from "../lib/hubDiyCreate";
import { popWorkshop, type WorkshopFrame } from "./workshopStack";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function blankHubCreateCard(deckId: string): CardDraftView {
  return {
    id: "hub-create-draft",
    deck_id: deckId,
    job_id: null,
    type: "qa",
    front: "",
    back: "",
    provenance: null,
    status: "draft",
    created_at: "",
    updated_at: "",
  };
}

type Args = {
  deckId: string;
  guest: boolean;
  showArchived: boolean;
  deckImageKeys: string[];
  setCards: React.Dispatch<React.SetStateAction<CardDraftView[]>>;
  setAcceptedCount: React.Dispatch<React.SetStateAction<number>>;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setWorkshopStack: React.Dispatch<React.SetStateAction<WorkshopFrame[]>>;
};

export type CreateCardController = {
  createCard: CardDraftView;
  createBusy: boolean;
  createImageBusy: boolean;
  createError: string | null;
  createNeedsImage: boolean;
  createImageKey: string;
  deckImageKeys: string[];
  createImageInputRef: RefObject<HTMLInputElement | null>;
  hubDiyAllowedTypes: CardType[];
  onCreateChange: (next: DraftEditorChange) => void;
  onCreateCard: (e?: FormEvent) => void;
  onCreateImageUpload: (file: File) => void;
  applyCreateImageKey: (key: string) => void;
  prepareCreateFrame: () => void;
};

export function useCreateCardController({
  deckId,
  guest,
  showArchived,
  deckImageKeys,
  setCards,
  setAcceptedCount,
  setNotice,
  setWorkshopStack,
}: Args): CreateCardController {
  const [createCard, setCreateCard] = useState<CardDraftView>(() =>
    blankHubCreateCard(deckId),
  );
  const [createBusy, setCreateBusy] = useState(false);
  const [createImageBusy, setCreateImageBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createImageInputRef = useRef<HTMLInputElement | null>(null);

  const createImageKey =
    createCard.media_r2_keys?.[0] ??
    (isOcclusionFront(createCard.front) ? createCard.front.image_key : "");
  const createNeedsImage =
    !guest &&
    (createCard.type === "occlusion" || createCard.type === "image_label");

  function applyCreateImageKey(key: string) {
    setCreateCard((prev) => {
      if (prev.type === "occlusion" && isOcclusionFront(prev.front)) {
        return {
          ...prev,
          media_r2_keys: [key],
          front: { ...prev.front, image_key: key },
        };
      }
      return { ...prev, media_r2_keys: [key] };
    });
  }

  async function onCreateImageUpload(file: File) {
    setCreateError(null);
    const contentType = resolveUploadContentType(file);
    if (!IMAGE_MIMES.has(contentType)) {
      setCreateError("Use a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setCreateError("Images must be 8MB or smaller");
      return;
    }
    setCreateImageBusy(true);
    try {
      const material = await uploadMaterialFile(deckId, file, undefined, {
        attachOnly: true,
      });
      if (!material.r2_key) {
        setCreateError("Upload did not return an image key");
        return;
      }
      applyCreateImageKey(material.r2_key);
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Could not upload image",
      );
    } finally {
      setCreateImageBusy(false);
      if (createImageInputRef.current) {
        createImageInputRef.current.value = "";
      }
    }
  }

  function onCreateChange(next: DraftEditorChange) {
    setCreateCard((prev) => {
      const imageKey = prev.media_r2_keys?.[0] ?? "";
      let front = next.front;
      let back = next.back;
      if (
        next.type === "occlusion" &&
        typeof front === "string" &&
        !isOcclusionFront(front)
      ) {
        front = starterOcclusionFront(imageKey);
        back = { answer: "r1" };
      }
      return {
        ...prev,
        front,
        back,
        type: next.type,
        options: next.options,
      };
    });
  }

  async function onCreateCard(e?: FormEvent) {
    e?.preventDefault();
    setCreateError(null);
    const validated = validateHubCreateCard(createCard);
    if (!validated.ok) {
      setCreateError(validated.error);
      return;
    }
    setCreateBusy(true);
    try {
      const created = await createDeckCard(deckId, validated.body);
      if (!showArchived) {
        setCards((prev) => [...prev, created]);
      }
      setAcceptedCount((n) => n + 1);
      setCreateCard(blankHubCreateCard(deckId));
      setNotice("Card added");
      setWorkshopStack((prev) => {
        const top = prev[prev.length - 1];
        return top?.id === "createCard" ? popWorkshop(prev) : prev;
      });
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Could not create card",
      );
    } finally {
      setCreateBusy(false);
    }
  }

  function prepareCreateFrame() {
    setCreateError(null);
    setCreateCard(blankHubCreateCard(deckId));
  }

  return {
    createCard,
    createBusy,
    createImageBusy,
    createError,
    createNeedsImage,
    createImageKey,
    deckImageKeys,
    createImageInputRef,
    hubDiyAllowedTypes: hubDiyTypes(guest),
    onCreateChange,
    onCreateCard,
    onCreateImageUpload,
    applyCreateImageKey,
    prepareCreateFrame,
  };
}
