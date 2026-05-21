import { type ReactNode, useEffect, useState } from "react";
import { Play } from "lucide-react";
import { apiClient } from "../../lib/api-client";
import { resolveMedia } from "../../lib/media-resolver";
import {
  formatMediaSize,
  mediaPreviewInfo,
  useVideoPoster,
} from "../../lib/media-preview";
import { MediaViewer } from "../../features/media-viewer/MediaViewer";
import { MessageAttachment } from "../../stores/chat-store";

type Props = {
  attachments?: MessageAttachment[];
  variant?: "chat" | "grid" | "viewer";
};

export function AttachmentRenderer({
  attachments = [],
  variant = "chat",
}: Props) {
  if (attachments.length === 0) return null;
  return (
    <div className={variant === "grid" ? "w-full min-w-0" : "mt-2 space-y-2"}>
      {attachments.map((attachment) => (
        <AttachmentItem
          key={attachment.id}
          attachment={attachment}
          variant={variant}
        />
      ))}
    </div>
  );
}

function AttachmentItem({
  attachment,
  variant,
}: {
  attachment: MessageAttachment;
  variant: NonNullable<Props["variant"]>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const asset = attachment.mediaAsset;
  const mimeType = asset.mimeType;
  const info = mediaPreviewInfo(mimeType);
  const thumbnailUrl = asset.thumbnailUrl
    ? resolveMedia(asset.thumbnailUrl)
    : null;
  const poster = useVideoPoster(
    url,
    Boolean(url && info.kind === "video" && variant === "grid"),
  );
  const useStableChatMediaSlot =
    variant === "chat" && (info.kind === "image" || info.kind === "video");

  useEffect(() => {
    if (asset.publicUrl) {
      setUrl(resolveMedia(asset.publicUrl));
      return;
    }
    let revoked = false;
    let objectUrl: string | null = null;
    void apiClient
      .get(`/media/${asset.id}`, { responseType: "blob" })
      .then((response) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(response.data);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.id, asset.publicUrl]);

  if (!url) {
    if (useStableChatMediaSlot) {
      return (
        <ChatMediaFrame>
          <AttachmentCard
            label={`Loading ${info.label.toLowerCase()}...`}
            info={info}
            size={asset.size}
            variant={variant}
            fill
          />
        </ChatMediaFrame>
      );
    }
    return (
      <AttachmentCard
        label={`Loading ${info.label.toLowerCase()}...`}
        info={info}
        size={asset.size}
        variant={variant}
      />
    );
  }

  if (info.kind === "image") {
    if (variant === "chat") {
      return (
        <>
          <button
            className="block max-w-full text-left"
            onClick={() => setViewerOpen(true)}
            type="button"
            aria-label="Open image viewer"
          >
            <ChatMediaFrame>
              <img
                src={url}
                alt=""
                className="h-full w-full object-contain"
                onDoubleClick={(event) => event.preventDefault()}
              />
            </ChatMediaFrame>
          </button>
          <MediaViewer
            item={
              viewerOpen
                ? {
                    id: attachment.id,
                    mimeType,
                    size: asset.size,
                    mediaAsset: asset,
                  }
                : null
            }
            onClose={() => setViewerOpen(false)}
          />
        </>
      );
    }

    if (variant === "viewer") {
      return (
        <ChatMediaFrame className="h-[72vh] w-full bg-black">
          <img
            src={url}
            alt=""
            className="h-full w-full object-contain"
            onDoubleClick={(event) => event.preventDefault()}
          />
        </ChatMediaFrame>
      );
    }

    return (
      <img
        src={url}
        alt=""
        className={
          variant === "grid"
            ? "h-full w-full object-cover"
            : "max-h-72 max-w-full rounded-xl object-contain"
        }
        onDoubleClick={(event) => event.preventDefault()}
      />
    );
  }

  if (info.kind === "video") {
    if (variant === "grid") {
      return (
        <div className="relative h-full w-full bg-black">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : poster ? (
            <img src={poster} alt="" className="h-full w-full object-cover" />
          ) : (
            <video
              src={url}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
              controls={false}
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              onDoubleClick={(event) => event.preventDefault()}
            />
          )}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/65 text-white ring-1 ring-white/20">
              <Play size={22} fill="currentColor" />
            </span>
          </div>
        </div>
      );
    }

    if (variant === "chat") {
      return (
        <>
          <ChatMediaFrame className="relative bg-black">
            <video
              src={url}
              controls
              className="h-full w-full object-contain"
              playsInline
              preload="metadata"
              controlsList="nodownload noremoteplayback"
              onDoubleClick={(event) => event.preventDefault()}
            />
            <button
              className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-white transition duration-150 hover:bg-purple-600"
              onClick={() => setViewerOpen(true)}
              type="button"
            >
              View
            </button>
          </ChatMediaFrame>
          <MediaViewer
            item={
              viewerOpen
                ? {
                    id: attachment.id,
                    mimeType,
                    size: asset.size,
                    mediaAsset: asset,
                  }
                : null
            }
            onClose={() => setViewerOpen(false)}
          />
        </>
      );
    }

    return (
      <video
        src={url}
        controls
        className="max-h-[72vh] w-full rounded-xl bg-black"
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        onDoubleClick={(event) => event.preventDefault()}
      />
    );
  }

  if (info.kind === "audio") {
    if (variant === "grid")
      return (
        <AttachmentCard
          label={info.label}
          info={info}
          size={asset.size}
          variant={variant}
        />
      );
    return <audio src={url} controls className="w-full min-w-56 max-w-full" />;
  }

  return (
    <a
      className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-sm font-medium hover:bg-black/25"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      <info.Icon size={18} />
      <span>Open {info.label}</span>
      <span className="ml-auto text-xs opacity-70">
        {formatMediaSize(asset.size)}
      </span>
    </a>
  );
}

function ChatMediaFrame({
  children,
  className = "bg-black/15",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`h-56 w-[min(18rem,70vw)] max-w-full overflow-hidden rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}

function AttachmentCard({
  label,
  info,
  size,
  variant,
  fill = false,
}: {
  label: string;
  info: ReturnType<typeof mediaPreviewInfo>;
  size?: number | null;
  variant: NonNullable<Props["variant"]>;
  fill?: boolean;
}) {
  return (
    <div
      className={
        variant === "grid"
          ? "flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-950 p-3 text-center text-xs text-gray-300"
          : fill
            ? "flex h-full w-full min-w-0 flex-col items-center justify-center gap-2 border border-white/10 px-3 py-2 text-center text-sm"
            : "flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-sm"
      }
    >
      <info.Icon size={variant === "grid" ? 24 : 18} />
      <span className="min-w-0 truncate">{label}</span>
      {size ? (
        <span className="text-xs opacity-70">{formatMediaSize(size)}</span>
      ) : null}
    </div>
  );
}
