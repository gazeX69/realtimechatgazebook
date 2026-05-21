import { InputHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={twMerge(
        'h-10 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-sm text-white outline-none transition-all duration-150 placeholder:text-gray-500 hover:border-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
