"use client";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonStyles } from "@/components/ui/Button";
import { getLocalSeals } from "@/lib/client/seals";
import { cn } from "@/lib/cn";

/** "Open the app" for newcomers; "Your seals (2)" for someone who already has seals on this browser. */
export function ReturningLink({ className }: { className?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => setCount(getLocalSeals().length), []);
  return (
    <Link href="/app" className={cn(buttonStyles({ variant: "secondary", size: "sm" }), className)}>
      {count ? (
        <>
          Your seals <span className="rounded-[5px] bg-sealed-soft px-1.5 text-xs text-sealed tabular">{count}</span>
        </>
      ) : (
        <>
          Open the app <ArrowRight className="size-3.5" aria-hidden />
        </>
      )}
    </Link>
  );
}
