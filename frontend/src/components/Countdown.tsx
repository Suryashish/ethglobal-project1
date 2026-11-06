"use client";
import { formatDuration } from "@/lib/format";
import { useNowSec } from "@/lib/client/hooks";
import { cn } from "@/lib/cn";

export function Countdown({ to, className, big = false }: { to: number; className?: string; big?: boolean }) {
  const now = useNowSec(1000);
  const left = to - now;
  return (
    <span
      className={cn("tabular font-mono", big ? "text-4xl sm:text-6xl tracking-tight" : "text-sm", className)}
      suppressHydrationWarning
      aria-live="off"
    >
      {now === 0 ? "—" : left <= 0 ? "now" : formatDuration(left)}
    </span>
  );
}
