import { Heart } from 'lucide-react';

export function ReactionButton({
  liked,
  count,
  disabled,
  onClick,
}: {
  liked: boolean;
  count: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition duration-150 hover:bg-purple-500/10 active:scale-[0.98] disabled:opacity-60 ${
        liked ? 'text-red-400' : 'text-gray-400 hover:text-gray-100'
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
      <span>{count} Likes</span>
    </button>
  );
}
