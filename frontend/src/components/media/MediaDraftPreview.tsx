import { Play, X } from 'lucide-react';
import { formatMediaSize, mediaPreviewInfo, useVideoPoster } from '../../lib/media-preview';

export type MediaDraftPreviewItem = {
  id: string;
  mimeType: string;
  size: number;
  url?: string | null;
  name?: string;
  status?: 'ready' | 'uploading' | 'error';
};

type Props = {
  items: MediaDraftPreviewItem[];
  onRemove: (id: string) => void;
};

export function MediaDraftPreview({ items, onRemove }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item, index) => (
        <div key={item.id} className="relative min-w-0 overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
          <PreviewBody item={item} />
          <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            {index + 1}
          </div>
          {item.status && item.status !== 'ready' ? (
            <div className={`absolute inset-x-0 bottom-0 px-2 py-1 text-xs ${item.status === 'error' ? 'bg-red-500/80 text-white' : 'bg-black/70 text-gray-100'}`}>
              {item.status === 'error' ? 'Upload failed' : 'Uploading...'}
            </div>
          ) : null}
          <button
            className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white hover:bg-black"
            onClick={() => onRemove(item.id)}
            title="Remove media"
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function PreviewBody({ item }: { item: MediaDraftPreviewItem }) {
  const info = mediaPreviewInfo(item.mimeType);
  const poster = useVideoPoster(item.url, Boolean(item.url && info.kind === 'video'));

  if (item.url && info.kind === 'image') {
    return <img src={item.url} alt="" className="h-28 w-full object-cover" />;
  }

  if (item.url && info.kind === 'video') {
    return (
      <div className="relative h-28 w-full bg-black">
        {poster ? (
          <img src={poster} alt="" className="h-full w-full object-cover" />
        ) : (
          <video src={item.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        )}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white ring-1 ring-white/20">
            <Play size={17} fill="currentColor" />
          </span>
        </div>
      </div>
    );
  }

  if (item.url && info.kind === 'audio') {
    return (
      <div className="flex h-28 flex-col items-center justify-center gap-2 px-3 text-center text-xs text-gray-300">
        <info.Icon size={24} />
        <span className="max-w-full truncate">{item.name ?? info.label}</span>
      </div>
    );
  }

  return (
    <div className="flex h-28 flex-col items-center justify-center gap-2 px-3 text-center text-xs text-gray-300">
      <info.Icon size={24} />
      <span className="max-w-full truncate">{item.name ?? info.label}</span>
      <span className="text-gray-500">{formatMediaSize(item.size)}</span>
    </div>
  );
}
