"use client";
import { encodeCover, fromBase64, validateDraft, type SealDraft } from "@iigs/core";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArmPanel, type ArmResult } from "@/components/ArmPanel";
import { ShareButtons } from "@/components/ShareButtons";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

function readDraft(): { draft?: SealDraft; error?: string } {
  try {
    const m = location.hash.match(/[#&]d=([^&]+)/);
    if (!m) return { error: "No draft found. Open this page from the Silent Seal extension." };
    const draft = JSON.parse(new TextDecoder().decode(fromBase64(decodeURIComponent(m[1]!)))) as SealDraft;
    const err = validateDraft(draft);
    return err ? { error: `The draft is invalid: ${err}` } : { draft };
  } catch {
    return { error: "The draft in the link could not be read." };
  }
}

export function ArmFromExtension() {
  const [state, setState] = useState<{ draft?: SealDraft; error?: string } | null>(null);
  const [armed, setArmed] = useState<{ res: ArmResult; post: string } | null>(null);

  useEffect(() => setState(readDraft()), []);

  function onArmed(res: ArmResult) {
    // The post is the cover phrase: an ordinary-looking text that hides the seal id (decoded by the extension).
    const post = encodeCover(res.sealId);
    setArmed({ res, post });
    window.postMessage(
      { source: "iigs-web", type: "IIGS_ARMED", sealId: res.sealId, ownerNullifier: res.ownerNullifier, post },
      location.origin,
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-serif text-[44px] leading-none tracking-[-0.02em] sm:text-[56px]">Arm your sealed post</h1>
        <p className="mt-4 text-[17px] text-ink-soft">The Silent Seal extension encrypted this on your device. One face check arms it.</p>
      </header>
      {armed ? (
        <Card className="space-y-4 border-sealed/30">
          <p className="font-medium text-sealed">Armed. Go back to the extension: your post is ready to insert.</p>
          <p data-cover-phrase className="break-words rounded-xl border border-line bg-field px-4 py-3 font-serif text-[17px] leading-relaxed">{armed.post}</p>
          <ShareButtons phrase={armed.post} />
          <div className="flex flex-wrap gap-2">
            <Link href={`/s/${armed.res.sealId}`} className={buttonStyles({ size: "sm" })}>View seal</Link>
            <Link href="/app" className={buttonStyles({ size: "sm", variant: "ghost" })}>Open vault</Link>
          </div>
        </Card>
      ) : state === null ? (
        <p className="text-muted" role="status">Reading the draft…</p>
      ) : state.error ? (
        <Card className="border-danger/30"><p role="alert" className="text-danger">{state.error}</p></Card>
      ) : (
        <Card><ArmPanel draft={state.draft!} onArmed={onArmed} /></Card>
      )}
    </div>
  );
}
