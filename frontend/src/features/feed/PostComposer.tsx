import { Paperclip, Send } from 'lucide-react';
import { AxiosError } from 'axios';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { MediaDraftPreview } from '../../components/media/MediaDraftPreview';
import { Button } from '../../components/ui/Button';
import { resolveUserIdentity } from '../../lib/identity-resolver';
import { User } from '../../stores/auth-store';
import { FeedPost, useFeedStore } from '../../stores/feed-store';

const MAX_MEDIA = 4;
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'application/pdf'];

export function PostComposer({ user, onSuccess }: { user: User | null; onSuccess?: (post: FeedPost) => void }) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [uploadStage, setUploadStage] = useState<'idle' | 'uploading' | 'posting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  const identity = resolveUserIdentity(user);

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedBody = body.trim();
    if ((!trimmedBody && files.length === 0) || !user || isPosting) return;

    setIsPosting(true);
    setUploadStage(files.length > 0 ? 'uploading' : 'posting');
    setError(null);
    try {
      const media = files.length > 0 ? await useFeedStore.getState().uploadPostMedia(files) : [];
      setUploadStage('posting');
      const post = await useFeedStore.getState().createPost(trimmedBody, user, media);
      setBody('');
      setFiles([]);
      onSuccess?.(post);
    } catch (caught) {
      setError(resolveComposerError(caught));
    } finally {
      setIsPosting(false);
      setUploadStage('idle');
    }
  }

  return (
    <form className="relative rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-neon" onSubmit={handleSubmit}>
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-sm font-semibold text-purple-200 ring-1 ring-purple-500/30">
          {identity.avatarUrl ? (
            <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            identity.initial
          )}
        </div>
        <textarea
          className="min-h-24 flex-1 resize-none rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-100 outline-none transition duration-150 placeholder:text-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
          maxLength={1000}
          placeholder="Share something with your circle"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>

      {previews.length > 0 ? (
        <div className="mt-3">
          <MediaDraftPreview
            items={previews.map((preview, index) => ({
              id: `${preview.file.name}-${preview.file.lastModified}-${index}`,
              mimeType: preview.file.type,
              size: preview.file.size,
              url: preview.url,
              name: preview.file.name,
              status: uploadStage === 'uploading' ? 'uploading' : 'ready',
            }))}
            onRemove={(id) => {
              const index = Number(id.split('-').at(-1));
              setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
            }}
          />
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-purple-300 transition hover:bg-purple-500/10">
          <Paperclip size={16} />
          Add media
          <input
            className="hidden"
            type="file"
            accept="image/*,video/*,audio/*,application/pdf"
            multiple
            disabled={isPosting}
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              const nextFiles = [...files, ...selected].slice(0, MAX_MEDIA);
              const invalid = nextFiles.find((file) => !isAllowedMedia(file));
              setError(invalid ? 'Gunakan image, video, audio, atau PDF sesuai batas ukuran upload.' : null);
              setFiles(invalid ? files : nextFiles);
              event.target.value = '';
            }}
          />
        </label>
        <Button disabled={(!body.trim() && files.length === 0) || isPosting}>
          <Send size={16} />
          {uploadStage === 'uploading' ? 'Uploading...' : uploadStage === 'posting' ? 'Posting...' : 'Post'}
        </Button>
      </div>
      {files.length >= MAX_MEDIA ? <p className="mt-2 text-xs text-gray-500">Maximum {MAX_MEDIA} media per post.</p> : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </form>
  );
}

function isAllowedMedia(file: File) {
  if (!ALLOWED_MEDIA_TYPES.includes(file.type) && !file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/')) return false;
  if (file.type.startsWith('image/')) return file.size <= 10 * 1024 * 1024;
  if (file.type.startsWith('video/')) return file.size <= 50 * 1024 * 1024;
  if (file.type.startsWith('audio/')) return file.size <= 20 * 1024 * 1024;
  if (file.type === 'application/pdf') return file.size <= 15 * 1024 * 1024;
  return false;
}

function resolveComposerError(error: unknown) {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { message?: string; error?: { details?: { message?: string | string[] } } } | undefined;
    const detailMessage = data?.error?.details?.message;
    if (Array.isArray(detailMessage)) return detailMessage[0] ?? 'Upload gagal. Coba lagi.';
    return data?.message ?? detailMessage ?? 'Upload gagal. Coba lagi.';
  }
  return error instanceof Error ? error.message : 'Upload gagal. Coba lagi.';
}
