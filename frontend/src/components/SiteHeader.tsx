import Link from "next/link";
import { Lock } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Lock className="size-4 text-sealed" aria-hidden />
          <span>IF I GO SILENT</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm text-muted" aria-label="Main">
          <Link className="rounded px-3 py-1.5 hover:bg-surface-2 hover:text-fg" href="/vault">Vault</Link>
          <Link className="rounded px-3 py-1.5 hover:bg-surface-2 hover:text-fg" href="/vault/new">Seal something</Link>
          <Link className="hidden rounded px-3 py-1.5 hover:bg-surface-2 hover:text-fg sm:block" href="/verify-reader">Verify as reader</Link>
        </nav>
      </div>
    </header>
  );
}
