import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  ApiError,
  createDeckCard,
  resolveUploadContentType,
  uploadMaterialFile,
  type CardDraftView,
  type CardType,
} from "../../api/client";
import type { DraftEditorChange } from "../../draftReview";
import { isOcclusionFront, starterOcclusionFront } from "../../draftReview";
import { hubDiyTypes, validateHubCreateCard } from "./hubDiyCreate";
import { MAX_IMAGE_BYTES } from "../cover/pdfPageRender";

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
  setCards: Dispatch<SetStateAction<CardDraftView[]>>;
  setAcceptedCount: Dispatch<SetStateAction<number>>;
};

export type CreateCardController = {
  createCard: CardDraftView;
  createBusy: boolean;
  createImageBusy: boolean;
  createError: string | null;
  createNotice: string | null;
  /** True after at least one successful add in this writer session. */
  createSessionHasCard: boolean;
  createNeedsImage: boolean;
  createImageKey: string;
  createImageInputRef: RefObject<HTMLInputElement | null>;
  hubDiyAllowedTypes: CardType[];
  onCreateChange: (next: DraftEditorChange) => void;
  onCreateCard: (e?: FormEvent) => void;
  onCreateImageUpload: (file: File) => void;
  applyCreateImageKey: (key: string) => void;
  clearCreateNotice: () => void;
  prepareCreateFrame: () => void;
  prepareOcclusionFromImageKey: (imageKey: string) => void;
};

/** Next blank draft after a successful add (keeps type; occlusion keeps image). */
export function nextHubCreateCard(prev: CardDraftView): CardDraftView {
  const blank = blankHubCreateCard(prev.deck_id);
  if (prev.type === "occlusion") {
    const key =
      prev.media_r2_keys?.[0] ??
      (isOcclusionFront(prev.front) ? prev.front.image_key : "");
    return {
      ...blank,
      type: "occlusion",
      media_r2_keys: key ? [key] : [],
      front: starterOcclusionFront(key),
      back: { answer: "" },
    };
  }
  if (prev.type === "image_label") {
    const key = prev.media_r2_keys?.[0] ?? "";
    return {
      ...blank,
      type: "image_label",
      media_r2_keys: key ? [key] : [],
    };
  }
  return { ...blank, type: prev.type };
}

export function useCreateCardController({
  deckId,
  guest,
  showArchived,
  setCards,
  setAcceptedCount,
}: Args): CreateCardController {
  const [createCard, setCreateCard] = useState<CardDraftView>(() =>
    blankHubCreateCard(deckId),
  );
  const [createBusy, setCreateBusy] = useState(false);
  const [createImageBusy, setCreateImageBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const [createSessionHasCard, setCreateSessionHasCard] = useState(false);
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
    setCreateError(null);
    setCreateNotice(null);
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
        back = { answer: "" };
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
    setCreateNotice(null);
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
      setCreateCard(nextHubCreateCard(createCard));
      setCreateSessionHasCard(true);
      setCreateNotice("added");
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Could not create card",
      );
    } finally {
      setCreateBusy(false);
    }
  }

  const clearCreateNotice = useCallback(() => {
    setCreateNotice(null);
  }, []);

  function prepareCreateFrame() {
    setCreateError(null);
    setCreateNotice(null);
    setCreateSessionHasCard(false);
    setCreateCard(blankHubCreateCard(deckId));
  }

  function prepareOcclusionFromImageKey(imageKey: string) {
    const key = imageKey.trim();
    setCreateError(null);
    setCreateNotice(null);
    setCreateSessionHasCard(false);
    setCreateCard({
      ...blankHubCreateCard(deckId),
      type: "occlusion",
      media_r2_keys: key ? [key] : [],
      front: starterOcclusionFront(key),
      back: { answer: "" },
    });
  }

  return {
    createCard,
    createBusy,
    createImageBusy,
    createError,
    createNotice,
    createSessionHasCard,
    createNeedsImage,
    createImageKey,
    createImageInputRef,
    hubDiyAllowedTypes: hubDiyTypes(guest),
    onCreateChange,
    onCreateCard,
    onCreateImageUpload,
    applyCreateImageKey,
    clearCreateNotice,
    prepareCreateFrame,
    prepareOcclusionFromImageKey,
  };
}
