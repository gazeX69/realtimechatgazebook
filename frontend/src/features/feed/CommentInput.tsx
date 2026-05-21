import { FormEvent, useState } from 'react';
import { Button } from '../../components/ui/Button';

export function CommentInput({
  placeholder = 'Tulis komentar',
  submitLabel = 'Comment',
  onSubmit,
}: {
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      setBody('');
      await onSubmit(trimmed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="flex gap-2" onSubmit={handleSubmit}>
      <input
        className="h-10 flex-1 rounded-full border border-gray-800 bg-gray-950 px-4 text-sm text-gray-100 outline-none transition placeholder:text-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
        placeholder={placeholder}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={1000}
      />
      <Button disabled={!body.trim() || isSubmitting}>{submitLabel}</Button>
    </form>
  );
}
