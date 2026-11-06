import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-surface p-5 sm:p-6", className)} {...p} />;
}
export function Label({ className, ...p }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("block text-xs font-medium uppercase tracking-[0.14em] text-muted", className)} {...p} />;
}
