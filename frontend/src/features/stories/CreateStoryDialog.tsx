import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Lock,
  Trash2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { formatMediaSize, mediaPreviewInfo } from "../../lib/media-preview";
import { useStoryStore } from "../../stores/story-store";
import { StoryMediaAsset } from "./types";

type StoryVisibility = "FOLLOWERS" | "FRIENDS" | "PRIVATE";

type DraftStoryItem = {
  id: string;
  file: File;
  previewUrl: string;
  uploadedAsset: StoryMediaAsset | null;
  status: "uploading" | "ready" | "error";
  error?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

const VISIBILITY_OPTIONS: {
  value: StoryVisibility;
  label: string;
  Icon: typeof Users;
}[] = [
  { value: "FOLLOWERS", label: "Followers", Icon: Users },
  { value: "FRIENDS", label: "Friends", Icon: UserRoundCheck },
  { value: "PRIVATE", label: "Private", Icon: Lock },
];

export function CreateStoryDialog({ open, onClose, onCreated }: Props) {
  const uploadStoryMedia = useStoryStore((state) => state.uploadStoryMedia);
  const createStory = useStoryStore((state) => state.createStory);
  const isCreating = useStoryStore((state) => state.isCreating);
  const storeError = useStoryStore((state) => state.error);
  const clearError = useStoryStore((state) => state.clearError);
  const [items, setItems] = useState<DraftStoryItem[]>([]);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<StoryVisibility>("FOLLOWERS");
  const [localError, setLocalError] = useState<string | null>(null);
  const uploadTokenRef = useRef(0);
  const itemsRef = useRef<DraftStoryItem[]>([]);
  const isUploading = items.some((item) => item.status === "uploading");
  const isBusy = isUploading || isCreating;
  const readyItems = items.filter((item) => item.status === "ready");

  useEffect(() => {
    if (!open) {
      resetDrafts();
      clearError();
    }
  }, [clearError, open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const canPublish = readyItems.length > 0 && !isBusy;
  const error = localError ?? storeError;
  const previewSummary = useMemo(() => {
    if (items.length === 0) return "Add one or more image/video moments.";
    if (isUploading) return "Uploading story media...";
    if (readyItems.length === items.length) return `${items.length} ready`;
    return "Some media needs attention.";
  }, [isUploading, items.length, readyItems.length]);

  if (!open) return null;

  function resetDrafts() {
    uploadTokenRef.current += 1;
    setItems((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setCaption("");
    setVisibility("FOLLOWERS");
    setLocalError(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    void addFiles(selected);
  }

  async function addFiles(files: File[]) {
    clearError();
    setLocalError(null);
    const storyFiles = files.filter(isStoryFile);
    if (storyFiles.length !== files.length) {
      setLocalError("Stories support image and video only.");
    }
    if (storyFiles.length === 0) return;

    const drafts = storyFiles.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      uploadedAsset: null,
      status: "uploading" as const,
      error: null,
    }));
    setItems((current) => [...current, ...drafts]);
    await Promise.all(drafts.map((draft) => uploadDraft(draft)));
  }

  async function uploadDraft(draft: DraftStoryItem) {
    const token = uploadTokenRef.current;
    try {
      const asset = await uploadStoryMedia(draft.file);
      if (uploadTokenRef.current !== token) return;
      setItems((current) =>
        current.map((item) =>
          item.id === draft.id
            ? { ...item, uploadedAsset: asset, status: "ready", error: null }
            : item,
        ),
      );
    } catch {
      if (uploadTokenRef.current !== token) return;
      setItems((current) =>
        current.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                uploadedAsset: null,
                status: "error",
                error: "Upload failed",
              }
            : item,
        ),
      );
    }
  }

  async function handleSubmit() {
    if (!canPublish) {
      setLocalError(
        isUploading
          ? "Wait for uploads to finish."
          : "Choose at least one image or video.",
      );
      return;
    }

    setLocalError(null);
    try {
      await createStory({
        visibility,
        caption,
        items: readyItems.map((item, orderIndex) => ({
          mediaAssetId: item.uploadedAsset!.id,
          caption,
          orderIndex,
        })),
      });
      onCreated?.();
      onClose();
    } catch {
      setLocalError("Could not publish story. Try again.");
    }
  }

  function removeItem(id: string) {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  function moveItem(id: string, direction: -1 | 1) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void addFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 px-3 pb-0 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-hidden rounded-t-2xl border border-gray-800 bg-gray-950 text-gray-100 shadow-2xl shadow-black/50 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 p-4">
          <div>
            <h2 className="text-base font-semibold">Create story</h2>
            <p className="mt-1 text-sm text-gray-400">{previewSummary}</p>
          </div>
          <button
            className="rounded-full p-2 text-gray-400 transition duration-150 hover:bg-gray-900 hover:text-white active:scale-95"
            onClick={onClose}
            type="button"
            aria-label="Close create story dialog"
            disabled={isBusy}
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(92dvh-5rem)] space-y-4 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <label
            className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-700 bg-gray-900/60 px-4 py-5 text-center text-sm text-gray-300 transition duration-150 hover:border-purple-500 hover:text-purple-100"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <ImagePlus size={30} />
            <span className="font-medium">Choose or drop image/video</span>
            <span className="text-xs text-gray-500">
              Select multiple to build a story sequence
            </span>
            <input
              className="sr-only"
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleFileChange}
            />
          </label>

          {items.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {items.map((item, index) => (
                <StoryDraftCard
                  key={item.id}
                  item={item}
                  index={index}
                  canMoveLeft={index > 0}
                  canMoveRight={index < items.length - 1}
                  onMove={(direction) => moveItem(item.id, direction)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Visibility
            </p>
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-gray-800 bg-gray-900 p-1">
              {VISIBILITY_OPTIONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition duration-150 active:scale-[0.98] ${
                    visibility === value
                      ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                      : "text-gray-400 hover:bg-purple-500/10 hover:text-gray-100"
                  }`}
                  onClick={() => setVisibility(value)}
                >
                  <Icon size={14} />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <textarea
            className="min-h-20 w-full resize-none rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none transition duration-150 placeholder:text-gray-500 focus:border-purple-500"
            maxLength={500}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Add a caption to this story sequence"
            value={caption}
          />

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <button
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition duration-150 hover:border-gray-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onClose}
              type="button"
              disabled={isBusy}
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-purple-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleSubmit}
              type="button"
              disabled={!canPublish}
            >
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : null}
              {isUploading ? "Uploading..." : "Publish story"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoryDraftCard({
  item,
  index,
  canMoveLeft,
  canMoveRight,
  onMove,
  onRemove,
}: {
  item: DraftStoryItem;
  index: number;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const info = mediaPreviewInfo(item.file.type);

  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
      {info.kind === "image" ? (
        <img
          src={item.previewUrl}
          alt=""
          className="h-32 w-full object-cover"
        />
      ) : (
        <video
          src={item.previewUrl}
          className="h-32 w-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      )}
      <div className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
        {index + 1}
      </div>
      <button
        className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white hover:bg-black"
        onClick={onRemove}
        type="button"
        aria-label="Remove story media"
      >
        <Trash2 size={14} />
      </button>
      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
        <button
          className="rounded-full bg-black/70 p-1 text-white disabled:opacity-30"
          onClick={() => onMove(-1)}
          type="button"
          disabled={!canMoveLeft}
          aria-label="Move story media earlier"
        >
          <ChevronLeft size={15} />
        </button>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            item.status === "ready"
              ? "bg-emerald-500/80 text-white"
              : item.status === "error"
                ? "bg-red-500/80 text-white"
                : "bg-black/70 text-gray-100"
          }`}
        >
          {item.status === "ready"
            ? "Ready"
            : item.status === "error"
              ? "Failed"
              : "Uploading"}
        </span>
        <button
          className="rounded-full bg-black/70 p-1 text-white disabled:opacity-30"
          onClick={() => onMove(1)}
          type="button"
          disabled={!canMoveRight}
          aria-label="Move story media later"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="px-2 py-1 text-[11px] text-gray-500">
        <span className="block truncate">{item.file.name}</span>
        <span>{formatMediaSize(item.file.size)}</span>
      </div>
    </div>
  );
}

function isStoryFile(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}
