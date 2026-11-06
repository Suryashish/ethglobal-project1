"use client";
import { Heart, LockOpen, MessageCircle, Repeat2 } from "lucide-react";
import { useEffect, useState } from "react";
import { WaxSeal } from "@/components/Logo";
import { cn } from "@/lib/cn";

const COVER = "Fiery farmers skip idly near the dusky ship. Quietly, true cottages coast across the rusty toad.";

/** Illustration of a hidden post in a feed, before and after it opens (cycles on its own until clicked). */
export function FeedDemo() {
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setOpen((o) => !o), 4500);
    return () => clearInterval(t);
  }, [auto]);

  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg border border-line bg-surface-2 p-[3px] text-[13px]" role="tablist" aria-label="Demo state">
        {(
          [
            [false, "Before"],
            [true, "After she goes silent"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={l}
            role="tab"
            aria-selected={open === v}
            type="button"
            onClick={() => {
              setAuto(false);
              setOpen(v);
            }}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 transition-colors",
              open === v ? "bg-field text-fg shadow-[0_1px_2px_rgb(60_45_25/0.12)]" : "text-muted hover:text-fg",
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <article className="rounded-2xl border border-[#e6e1d8] bg-white p-5 shadow-[0_1px_2px_rgb(60_45_25/0.06),0_12px_32px_-18px_rgb(60_45_25/0.25)]" aria-label="Example post (illustration)">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#d9cdb8] font-serif text-[15px] text-[#5a4c36]" aria-hidden>
            AF
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-tight">
              <span className="font-semibold">Ana Ferreira</span> <span className="text-[#8a8478]">@ana_reports · 3d</span>
            </p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-[#2b2925]">{COVER}</p>

            {open ? (
              <div key="open" className="fade-swap mt-3 overflow-hidden rounded-xl border border-released/25 bg-released-soft/60">
                <div className="flex items-center gap-2 px-3.5 pt-3 text-[13px]">
                  <LockOpen className="size-3.5 text-released" aria-hidden />
                  <span className="font-medium text-released">Opened by the seal</span>
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-faint">
                    <WaxSeal className="size-3.5" /> Silent Seal
                  </span>
                </div>
                <p className="m-2 mt-2.5 rounded-lg bg-white px-3.5 py-3 font-serif text-[16px] leading-relaxed text-fg">
                  If you are reading this, I went silent. The ledgers and the recordings are on the seal page. Finish it. — A
                </p>
              </div>
            ) : null}

            <div className="mt-3 flex gap-8 text-[13px] text-[#8a8478]" aria-hidden>
              <span className="flex items-center gap-1.5"><MessageCircle className="size-4" /> 12</span>
              <span className="flex items-center gap-1.5"><Repeat2 className="size-4" /> 48</span>
              <span className="flex items-center gap-1.5"><Heart className="size-4" /> 210</span>
            </div>
          </div>
        </div>
      </article>
      <p className="mt-3 min-h-10 text-sm text-muted">
        {open
          ? "Every follower with the extension reads it in place, decrypted in their own browser."
          : "Just a post. Nothing marks it as a seal, not even to the people watching her."}
      </p>
    </div>
  );
}
