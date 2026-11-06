import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "border-line text-muted bg-surface-2",
  sealed: "border-sealed/40 text-sealed bg-sealed/10",
  released: "border-released/40 text-released bg-released/10",
  danger: "border-danger/40 text-danger bg-danger/10",
};
export function Badge({ tone = "neutral", className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", tones[tone], className)}
      {...p}
    />
  );
}
