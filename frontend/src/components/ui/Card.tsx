import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel rounded-2xl p-5 sm:p-7", className)} {...p} />;
}
export function Label({ className, ...p }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("block text-[13px] font-medium text-muted", className)} {...p} />;
}
/** Form section heading: "1. What to seal" in the reading serif. */
export function StepTitle({ n, title, hint }: { n: string; title: string; hint?: string }) {
  return (
    <div>
      <h2 className="font-serif text-[22px] leading-tight text-fg">
        <span className="mr-2 text-faint">{Number(n)}.</span>
        {title}
      </h2>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}
