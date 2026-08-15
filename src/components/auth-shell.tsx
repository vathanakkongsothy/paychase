import Link from "next/link";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-70" />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <header>
          <Link href="/" className="inline-flex min-h-11 items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-800 text-sm font-bold text-white">
              P
            </span>
            <span className="font-[family-name:var(--font-display)] text-xl text-stone-900">
              PayChase
            </span>
          </Link>
        </header>
        <div className="flex flex-1 flex-col justify-center py-10">{children}</div>
      </div>
    </main>
  );
}
