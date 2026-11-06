"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";
import { buttonStyles } from "./ui/Button";

const NAV = [
  { href: "/app", label: "Seals", match: (p: string) => p === "/app" },
  { href: "/verify-reader", label: "Reader", match: (p: string) => p.startsWith("/verify-reader") },
] as const;

/** The app shell header (everything except the landing page). */
export function SiteHeader() {
  const path = usePathname() ?? "";
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Logo href="/" />
          <nav className="hidden items-center gap-1 text-[15px] sm:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  n.match(path) ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app" className={cn(buttonStyles({ variant: "ghost", size: "sm" }), "sm:hidden")}>
            Seals
          </Link>
          {path !== "/app/new" ? (
            <Link href="/app/new" className={buttonStyles({ variant: "primary", size: "sm" })}>
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">Seal something</span>
              <span className="sm:hidden">Seal</span>
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
