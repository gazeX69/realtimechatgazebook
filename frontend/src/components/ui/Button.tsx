import { ButtonHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={twMerge(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 px-4 text-sm font-medium text-white shadow-lg shadow-purple-500/10 transition-all duration-150 hover:from-purple-600 hover:to-purple-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
