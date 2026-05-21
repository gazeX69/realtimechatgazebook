import { useEffect, useState } from 'react';
import { File, FileText, Image, LucideIcon, Music, Video } from 'lucide-react';

export type MediaPreviewInfo = {
  kind: 'image' | 'video' | 'audio' | 'pdf' | 'file';
  label: string;
  Icon: LucideIcon;
  canInlinePreview: boolean;
};

export function mediaPreviewInfo(mimeType?: string | null): MediaPreviewInfo {
  if (!mimeType) return { kind: 'file', label: 'File', Icon: File, canInlinePreview: false };
  if (mimeType.startsWith('image/')) return { kind: 'image', label: 'Image', Icon: Image, canInlinePreview: true };
  if (mimeType.startsWith('video/')) return { kind: 'video', label: 'Video', Icon: Video, canInlinePreview: true };
  if (mimeType.startsWith('audio/')) return { kind: 'audio', label: 'Audio', Icon: Music, canInlinePreview: true };
  if (mimeType === 'application/pdf') return { kind: 'pdf', label: 'PDF', Icon: FileText, canInlinePreview: false };
  return { kind: 'file', label: 'File', Icon: File, canInlinePreview: false };
}

export function formatMediaSize(value?: number | null) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

let videoPosterQueue = Promise.resolve();

export function useVideoPoster(source?: string | null, enabled = true) {
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    setPoster(null);
    if (!source || !enabled) return;

    let cancelled = false;
    const run = () => {
      void enqueueVideoPoster(source).then((nextPoster) => {
        if (!cancelled) setPoster(nextPoster);
      });
    };

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(run, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(run, 100);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutId);
    };
  }, [enabled, source]);

  return poster;
}

function enqueueVideoPoster(source: string) {
  const task = videoPosterQueue.then(() => createVideoPoster(source));
  videoPosterQueue = task.catch(() => null).then(() => undefined);
  return task;
}

async function createVideoPoster(source: string) {
  return new Promise<string | null>((resolve) => {
    const video = document.createElement('video');
    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
    const fail = () => {
      cleanup();
      resolve(null);
    };
    const capture = () => {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
          fail();
          return;
        }

        const maxEdge = 640;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          fail();
          return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const poster = canvas.toDataURL('image/jpeg', 0.72);
        cleanup();
        resolve(poster);
      } catch {
        fail();
      }
    };
    const seekToFrame = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target = duration > 0 ? Math.min(Math.max(duration * 0.1, 0.5), 1.5, Math.max(0, duration - 0.05)) : 0.8;

      if (target <= 0) {
        capture();
        return;
      }

      video.currentTime = target;
    };

    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', seekToFrame, { once: true });
    video.addEventListener('seeked', capture, { once: true });
    video.addEventListener('error', fail, { once: true });
    video.src = source;
    video.load();
  });
}
