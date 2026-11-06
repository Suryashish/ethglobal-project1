"use client";
import { draftDigest, ownerSignal, type SealDraft } from "@iigs/core";
import type { WorldProofEnvelope } from "@iigs/world";
import { WorldVerifyButton } from "@iigs/world/client";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { apiPost, errorMessage } from "@/lib/client/api";
import { useIssuedAt } from "@/lib/client/hooks";
import { addLocalSeal, setOwner } from "@/lib/client/seals";
import { audienceText, ruleText } from "@/lib/rules";
import { buttonStyles } from "./ui/Button";

export type ArmResult = { sealId: string; sealEntityKey: string; txHash: string; ownerNullifier: string; createdAt: number };

/** Summary of a ready draft + the "Arm with World ID" button (POST /api/seals). */
export function ArmPanel({ draft, onArmed }: { draft: SealDraft; onArmed: (r: ArmResult) => void | Promise<void> }) {
  const issuedAt = useIssuedAt();
  const signal = ownerSignal("arm", draft.sealId, issuedAt, draftDigest(draft));

  async function onVerified(proof: WorldProofEnvelope) {
    try {
      const res = await apiPost<ArmResult>("/api/seals", { draft, proof });
      setOwner(res.ownerNullifier);
      addLocalSeal(res.sealId);
      await onArmed(res);
    } catch (e) {
      toast.error("Could not arm the seal", { description: errorMessage(e) });
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  return (
    <div className="space-y-5">
      <dl className="grid gap-x-4 gap-y-3 rounded-xl border border-line bg-field p-5 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted">Seal id</dt>
        <dd className="font-mono text-sealed">{draft.sealId}</dd>
        {draft.title ? (
          <>
            <dt className="text-muted">Public title</dt>
            <dd>{draft.title}</dd>
          </>
        ) : null}
        <dt className="text-muted">Rule</dt>
        <dd className="first-letter:uppercase">{ruleText(draft)}</dd>
        <dt className="text-muted">Audience</dt>
        <dd>{audienceText(draft)}</dd>
        <dt className="text-muted">Stored on</dt>
        <dd>{draft.contentType === "swarm" ? `Swarm (${draft.swarmRef?.slice(0, 12)}…) · ${draft.sizeBytes} B encrypted` : `Arkiv (inline) · ${draft.sizeBytes} B encrypted`}</dd>
      </dl>
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/70 p-4 text-sm leading-relaxed">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-released" aria-hidden />
        <p className="text-muted">
          <span className="text-fg">Selfie Check, because the risk is someone else holding your phone.</span> The proof is bound to this exact
          ciphertext and rule, and ties the seal to your face. Only the same human can ever check in, disarm or change it.
        </p>
      </div>
      <WorldVerifyButton
        kind="owner"
        signal={signal}
        label="Arm with World ID"
        disabled={issuedAt === 0}
        className={buttonStyles({ variant: "primary", size: "lg", className: "w-full sm:w-auto" })}
        onVerified={onVerified}
      />
    </div>
  );
}
