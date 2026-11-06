"use client";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { WaxSeal } from "@/components/Logo";

/** Illustration: a sealed letter on the desk, counting down. */
export function SealedLetter() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const end = Date.now() + (2 * 86400 + 14 * 3600 + 7 * 60 + 31) * 1000;
    const tick = () => setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const parts = left === null ? null : [Math.floor(left / 86400), Math.floor((left % 86400) / 3600), Math.floor((left % 3600) / 60), left % 60];

  return (
    <div className="relative mx-auto w-full max-w-[460px] pt-8" aria-label="Example of a sealed letter (illustration)">
      {/* the sheets underneath */}
      <div aria-hidden className="panel absolute inset-x-6 bottom-[-14px] top-14 rotate-[3.2deg] rounded-2xl" />
      <div aria-hidden className="panel absolute inset-x-3 bottom-[-6px] top-11 -rotate-[1.6deg] rounded-2xl" />

      <article className="panel relative rounded-2xl px-7 pb-7 pt-12 sm:px-9">
        <WaxSeal className="absolute -top-8 left-1/2 size-[72px] -translate-x-1/2 drop-shadow-[0_6px_8px_rgb(90_30_20/0.3)]" />

        <p className="text-center font-serif text-[15px] italic text-muted">To be opened if I go silent</p>
        <h3 className="mt-3 text-balance text-center font-serif text-[26px] leading-[1.15] text-fg">Port contracts: the ledgers and the audio</h3>

        <div className="mt-7 rounded-xl border border-line bg-field px-5 py-4">
          <p className="text-[13px] text-muted">Opens if she is silent for</p>
          <p className="mt-1 font-mono text-[28px] font-medium tracking-tight text-sealed tabular" suppressHydrationWarning>
            {parts
              ? `${String(parts[0]).padStart(2, "0")}d ${String(parts[1]).padStart(2, "0")}h ${String(parts[2]).padStart(2, "0")}m ${String(parts[3]).padStart(2, "0")}s`
              : "–"}
          </p>
        </div>

        <dl className="mt-5 space-y-2.5 text-sm">
          {[
            ["Rule", "Dead-man, 3 days"],
            ["Readers", "Verified, from 🇲🇹 Malta and 🇮🇳 India"],
            ["Kept on", "Swarm, 2.4 MB encrypted"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2">
              <dt className="text-muted">{k}</dt>
              <span aria-hidden className="flex-1 translate-y-[-3px] border-b border-dotted border-line-strong" />
              <dd className="text-right text-fg">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-[13px] text-released">
          <span className="grid size-4 place-items-center rounded-full bg-released text-white">
            <Check className="size-3" strokeWidth={3} aria-hidden />
          </span>
          Sealed by a verified human, checked by face
        </p>
      </article>
    </div>
  );
}
