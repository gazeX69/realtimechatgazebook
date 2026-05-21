import { ReactNode } from 'react';

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <section className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-lg shadow-purple-500/10 sm:p-8">
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
}
