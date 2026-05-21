import { ReactNode, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  X,
} from "lucide-react";

import { apiClient } from "../../lib/api-client";
import { resolveMedia } from "../../lib/media-resolver";
import { mediaPreviewInfo } from "../../lib/media-preview";
import { MediaAsset } from "../../stores/chat-store";

export type MediaViewerItem = {
  id: string;
  mimeType: string;
  size?: number | null;
  src?: string | null;
  mediaAsset?: MediaAsset | null;
};

type Props = {
  open?: boolean;
  item: MediaViewerItem | null;

  hasNext?: boolean;
  hasPrev?: boolean;

  onNext?: () => void;
  onPrev?: () => void;

  title?: string;
  caption?: string | null;
  actions?: ReactNode;
  onClose: () => void;
};

export function MediaViewer({
  open,
  item,

  hasNext,
  hasPrev,

  onNext,
  onPrev,

  title,
  caption,
  actions,
  onClose,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isOpen = open ?? Boolean(item);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!item) return undefined;

    const publicUrl = item.mediaAsset?.publicUrl ?? item.src;
    if (publicUrl) {
      setUrl(resolveMedia(publicUrl));
      return undefined;
    }

    const assetId = item.mediaAsset?.id;
    if (!assetId) {
      setFailed(true);
      return undefined;
    }

    let revoked = false;
    let objectUrl: string | null = null;
    setIsLoading(true);
    void apiClient
      .get(`/media/${assetId}`, { responseType: "blob" })
      .then((response) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(response.data);
        setUrl(objectUrl);
      })
      .catch(() => setFailed(true))
      .finally(() => {
        if (!revoked) setIsLoading(false);
      });

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item?.id, item?.src, item?.mediaAsset?.id, item?.mediaAsset?.publicUrl]);

  useEffect(() => {
    if (isOpen) return;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }, [isOpen]);




  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowRight" && onNext) {
        onNext();
      }

      if (event.key === "ArrowLeft" && onPrev) {
        onPrev();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose, onNext, onPrev]);


  

  const info = mediaPreviewInfo(item?.mimeType);

  console.log("[NAV DEBUG]", {
  hasPrev,
  hasNext,
  item,
});

  if (!isOpen) return null;

  async function requestFullscreen() {
    if (!shellRef.current || document.fullscreenElement) return;
    await shellRef.current.requestFullscreen().catch(() => undefined);
  }



  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-3 py-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={shellRef}
        className="relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-black shadow-2xl shadow-black/60"
      >
        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent p-3">
          <div className="min-w-0">
            {title ? (
              <p className="truncate text-sm font-semibold text-white">
                {title}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            {actions}
            <button
              className="rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95"
              onClick={requestFullscreen}
              type="button"
              aria-label="Fullscreen"
            >
              <Maximize2 size={18} />
            </button>
            <button
              className="rounded-full bg-gray-950/80 p-2 text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95"
              onClick={onClose}
              type="button"
              aria-label="Close media viewer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {hasPrev ? (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-3 top-1/2 z-[60] -translate-y-1/2 rounded-full bg-gray-950/80 p-3 text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95"
            aria-label="Previous media"
          >
            <ChevronLeft size={26} />
          </button>
        ) : null}

        {hasNext ? (
          <button
            type="button"
            onClick={onNext}
            className="absolute right-3 top-1/2 z-[60] -translate-y-1/2 rounded-full bg-gray-950/80 p-3 text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95"
            aria-label="Next media"
          >
            <ChevronRight size={26} />
          </button>
        ) : null}

        <div className="flex items-center justify-center overflow-auto p-3 pt-14">
          {isLoading ? (
            <Loader2 size={28} className="animate-spin text-gray-400" />
          ) : !item ? (
            <Loader2 size={28} className="animate-spin text-gray-400" />
          ) : failed || !url ? (
            <div className="flex flex-col items-center gap-2 text-sm text-gray-400">
              <info.Icon size={28} />
              <span>Media unavailable</span>
            </div>
          ) : info.kind === "image" ? (
            <img
              src={url}
              alt=""
              className="max-h-[82dvh] max-w-full object-contain"
              onDoubleClick={(event) => event.preventDefault()}
            />
          ) : info.kind === "video" ? (
            <video
              ref={videoRef}
              src={url}
              controls
              playsInline
              preload="metadata"
              controlsList="nodownload noremoteplayback"
              className="h-auto max-h-[82dvh] w-auto max-w-full rounded-xl bg-black"
              onDoubleClick={(event) => event.preventDefault()}
            />
          ) : (
            <a
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-gray-950 px-4 py-3 text-sm font-medium text-gray-100 hover:bg-gray-900"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              <info.Icon size={18} />
              <span>Open {info.label}</span>
            </a>
          )}
        </div>

        {caption ? (
          <div className="bg-black px-4 pb-4 pt-2 text-center text-sm text-gray-100">
            {caption}
          </div>
        ) : null}
      </div>
    </div>
  );
}
