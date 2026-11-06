"use client";
import { ownerSignal, type OwnerAction as Action } from "@iigs/core";
import type { WorldProofEnvelope } from "@iigs/world";
import { WorldVerifyButton } from "@iigs/world/client";
import { toast } from "sonner";
import { ApiClientError, apiPost, errorMessage } from "@/lib/client/api";
import { useIssuedAt } from "@/lib/client/hooks";
import { buttonStyles } from "./ui/Button";
import type { VariantProps } from "class-variance-authority";

/**
 * A World-verified owner action. The proof commits to (action, sealId, extra, issuedAt); the server
 * checks the face-check identity equals the human who armed the seal (403 different_human otherwise).
 */
export function OwnerActionButton<T = unknown>({
  action,
  sealId,
  extra = "",
  body = {},
  label,
  variant,
  size = "sm",
  disabled,
  sessionId,
  onDone,
}: {
  /** The seal's ownerNullifier (World session id in live mode). */
  sessionId?: string;
  action: Exclude<Action, "arm">;
  sealId: string;
  extra?: string;
  body?: Record<string, unknown>;
  label: string;
  disabled?: boolean;
  onDone?: (result: T) => void;
} & VariantProps<typeof buttonStyles>) {
  const issuedAt = useIssuedAt();
  const signal = ownerSignal(action, sealId, issuedAt, extra);

  async function onVerified(proof: WorldProofEnvelope) {
    try {
      const res = await apiPost<T>(`/api/seals/${sealId}/${action}`, { proof, ...body });
      onDone?.(res);
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "different_human") {
        toast.error("Refused: not the author", { description: e.message });
      } else {
        toast.error("Action failed", { description: errorMessage(e) });
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  return (
    <WorldVerifyButton
      kind="owner"
      sessionId={sessionId}
      signal={signal}
      label={label}
      disabled={disabled || issuedAt === 0}
      className={buttonStyles({ variant, size })}
      onVerified={onVerified}
    />
  );
}
