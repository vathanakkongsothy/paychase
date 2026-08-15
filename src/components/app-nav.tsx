import Link from "next/link";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  Plus,
  UserRound,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Profile", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ pathname }: { pathname: string }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <Link href="/dashboard" className="flex min-h-11 items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-800 text-sm font-bold text-white">
              P
            </span>
            <span className="font-[family-name:var(--font-display)] text-lg tracking-tight text-stone-900">
              PayChase
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition",
                  isActive(pathname, item.href)
                    ? "bg-stone-100 text-stone-900"
                    : "text-stone-500 hover:text-stone-900",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/invoices/upload"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-teal-800 px-3 text-sm font-medium text-white hover:bg-teal-900"
          >
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">Upload</span>
            <span className="hidden sm:inline">Upload Invoices</span>
          </Link>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-teal-800" : "text-stone-400",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
