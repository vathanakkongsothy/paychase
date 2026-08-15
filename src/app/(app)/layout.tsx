"use client";

import { usePathname } from "next/navigation";
import { AppNav } from "@/components/app-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh">
      <AppNav pathname={pathname} />
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6 sm:py-8 md:pb-8">
        {children}
      </div>
    </div>
  );
}
