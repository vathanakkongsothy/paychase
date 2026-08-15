import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-70" />
      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 sm:pb-16">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-800 text-sm font-bold text-white">
              P
            </span>
            <span className="font-[family-name:var(--font-display)] text-xl text-stone-900">
              PayChase
            </span>
          </div>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center text-sm font-medium text-stone-600 hover:text-stone-900"
          >
            Sign in
          </Link>
        </header>

        <section className="flex flex-1 flex-col justify-center py-10 sm:py-16 md:py-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-teal-800 sm:mb-4 sm:text-sm">
            PayChase
          </p>
          <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-[2.15rem] leading-[1.08] tracking-tight text-stone-900 sm:text-6xl md:text-7xl">
            Upload your invoices.
            <span className="block text-teal-800">See who still owes you money.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-stone-600 sm:mt-6 sm:text-lg">
            Find overdue money, prioritize what to chase, and generate the right
            follow-up — without turning into accounting software.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/signup">Create account</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-stone-500 sm:mt-8">
            PDF or image upload · Instant outstanding totals · Chase list · Copy-ready reminders
          </p>
        </section>

        <section className="grid gap-3 sm:gap-4 md:grid-cols-3">
          {[
            {
              title: "Extract",
              body: "Upload PDFs or photos. Review every field with confidence scores.",
            },
            {
              title: "Prioritize",
              body: "Deterministic chase scoring surfaces the money that needs attention today.",
            },
            {
              title: "Follow up",
              body: "Generate professional reminders, copy them, mark sent, track promises.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-stone-200/80 bg-white/70 p-4 sm:p-5">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-stone-900 sm:text-xl">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{item.body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
