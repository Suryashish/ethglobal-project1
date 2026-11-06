"use client";
import { FolderLock, Plus, ScanSearch } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";
import { buttonStyles } from "./ui/Button";

// The three things anyone comes here to do. Same order everywhere (header, phone tab bar, landing).
const NAV = [
  { href: "/app", label: "Your seals", icon: FolderLock, match: (p: string) => p === "/app" },
  { href: "/app/new", label: "Seal something", short: "Seal", icon: Plus, match: (p: string) => p === "/app/new" },
  { href: "/open", label: "Open a seal", short: "Open", icon: ScanSearch, match: (p: string) => p === "/open" || p.startsWith("/verify-reader") },
] as const;

/** App shell navigation: a header on wide screens, a thumb-reach tab bar on phones. */
export function SiteHeader() {
  const path = usePathname() ?? "";
  return (
    <>
      <a
        href="#main"
        className="fixed left-3 top-3 z-[60] -translate-y-16 rounded-lg bg-fg px-4 py-2 text-sm text-surface transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo href="/" />
          <nav className="hidden items-center gap-1 text-[15px] sm:flex" aria-label="Main">
            {NAV.filter((n) => n.href !== "/app/new").map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={n.match(path) ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  n.match(path) ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg",
                )}
              >
                {n.label}
              </Link>
            ))}
            <Link
              href="/app/new"
              aria-current={path === "/app/new" ? "page" : undefined}
              className={cn(buttonStyles({ variant: path === "/app/new" ? "secondary" : "primary", size: "sm" }), "ml-2")}
            >
              <Plus className="size-4" aria-hidden /> Seal something
            </Link>
          </nav>
        </div>
      </header>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {NAV.map((n) => {
            const on = n.match(path);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-1 py-2.5 text-[12px]", on ? "text-fg" : "text-muted")}
                >
                  <span className={cn("grid h-7 w-12 place-items-center rounded-lg transition-colors", on && "bg-surface-2")}>
                    <n.icon className="size-[18px]" aria-hidden />
                  </span>
                  {"short" in n ? n.short : n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
