import { useState } from "react";
import { Play } from "lucide-react";
import { AttachmentRenderer } from "../../components/media/AttachmentRenderer";
import { MediaViewer } from "../media-viewer/MediaViewer";
import { resolveMedia } from "../../lib/media-resolver";
import { mediaPreviewInfo, useVideoPoster } from "../../lib/media-preview";
import { PostMedia } from "../../stores/feed-store";

export function MediaGrid({ media }: { media: PostMedia[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (media.length === 0) return null;
  const visibleMedia = media.slice(0, 4);
  const extraCount = Math.max(0, media.length - 4);
  const activeMedia = activeIndex === null ? null : media[activeIndex];

  return (
    <>
      <div
        className={`mt-4 grid w-full max-w-full min-w-0 overflow-hidden rounded-xl ring-1 ring-gray-800 ${gridLayoutClass(media.length)}`}
      >
        {visibleMedia.map((item, index) => (
          <MediaImage
            key={`${item.fileUrl}-${index}`}
            item={item}
            className={tileClass(media.length, index)}
            extraCount={index === 3 ? extraCount : 0}
            onOpen={() => setActiveIndex(index)}
          />
        ))}
      </div>
      <MediaViewer
          open={activeIndex !== null}
          item={activeMedia ? toViewerItem(activeMedia) : null}
          onClose={() => setActiveIndex(null)}

          hasPrev={
            activeIndex !== null &&
            activeIndex > 0
          }

          hasNext={
            activeIndex !== null &&
            activeIndex < media.length - 1
          }

          onPrev={() => {
            setActiveIndex((current) => {
              if (current === null) return current;
              return Math.max(current - 1, 0);
            });
          }}

          onNext={() => {
            setActiveIndex((current) => {
              if (current === null) return current;
              return Math.min(current + 1, media.length - 1);
            });
          }}
        />
    </>
  );
}

function MediaImage({
  item,
  className,
  extraCount = 0,
  onOpen,
}: {
  item: PostMedia;
  className?: string;
  extraCount?: number;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const src = resolveMedia(item.publicUrl ?? item.fileUrl);
  const asset = item.mediaAsset;
  const info = mediaPreviewInfo(asset?.mimeType ?? item.mimeType);
  const [loading, setLoading] = useState(info.kind === "image" && !asset);
  const poster = useVideoPoster(
    src,
    Boolean(src && info.kind === "video" && !asset),
  );

  if (failed) {
    return (
      <div
        className={`relative flex min-h-32 min-w-0 flex-col items-center justify-center gap-2 bg-gray-950 p-4 text-sm text-gray-500 ${className ?? ""}`}
      >
        <span>Media failed to load</span>
        <button
          className="rounded-lg border border-gray-700 px-3 py-1 text-xs font-medium text-gray-300 transition duration-150 hover:border-purple-500 hover:text-purple-200 active:scale-[0.98]"
          onClick={() => {
            setFailed(false);
            setLoading(info.kind === "image" && !asset);
            setRetryKey((current) => current + 1);
          }}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <button
      className={`group relative block min-h-32 w-full max-w-full min-w-0 overflow-hidden bg-gray-950 transition duration-150 active:scale-[0.99] ${className ?? ""}`}
      onClick={onOpen}
      type="button"
      aria-label="Open media viewer"
    >
      {loading ? (
        <div className="absolute inset-0 animate-pulse bg-gray-800" />
      ) : null}
      {asset && info.kind !== "image" ? (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <AttachmentRenderer
            attachments={[
              {
                id: item.id ?? asset.id,
                orderIndex: item.orderIndex,
                mediaAsset: asset,
              },
            ]}
            variant="grid"
          />
        </div>
      ) : info.kind === "video" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          {poster ? (
            <img
              src={poster}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <video
              key={`${src}-${retryKey}`}
              src={src}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
              controls={false}
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              onLoadedData={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
              onDoubleClick={(event) => event.preventDefault()}
            />
          )}
        </div>
      ) : (
        <img
          key={`${src}-${retryKey}`}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
          onLoad={() => setLoading(false)}
        />
      )}
      {info.kind === "video" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/65 text-white ring-1 ring-white/20">
            <Play size={22} fill="currentColor" />
          </span>
        </div>
      ) : null}
      {extraCount > 0 ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-3xl font-semibold text-white">
          +{extraCount}
        </div>
      ) : null}
    </button>
  );
}

function toViewerItem(media: PostMedia) {
  return {
    id: media.id ?? media.mediaAssetId ?? media.fileUrl,
    mimeType: media.mediaAsset?.mimeType ?? media.mimeType,
    size: media.mediaAsset?.size ?? media.size,
    src: media.mediaAsset
      ? undefined
      : resolveMedia(media.publicUrl ?? media.fileUrl),
    mediaAsset: media.mediaAsset ?? null,
  };
}

function gridLayoutClass(count: number) {
  if (count === 1) return "aspect-video grid-cols-1";
  if (count === 2) return "aspect-video grid-cols-2 gap-1.5";
  if (count === 3) return "aspect-[4/3] grid-cols-2 grid-rows-2 gap-1.5";
  return "aspect-square grid-cols-2 grid-rows-2 gap-1.5";
}

function tileClass(count: number, index: number) {
  if (count === 1) return "aspect-video rounded-xl";
  if (count === 3 && index === 0) return "row-span-2";
  return "";
}
