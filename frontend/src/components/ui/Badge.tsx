import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "border-line-strong/70 text-muted bg-surface-2",
  sealed: "border-sealed/25 text-sealed bg-sealed-soft",
  released: "border-released/25 text-released bg-released-soft",
  danger: "border-danger/25 text-danger bg-danger/[0.06]",
};
export function Badge({ tone = "neutral", className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-[3px] text-xs font-medium", tones[tone], className)}
      {...p}
    />
  );
}
