"use client";
import { readerSignal } from "@iigs/core";
import type { WorldProofEnvelope } from "@iigs/world";
import { WorldVerifyButton } from "@iigs/world/client";
import { useMemo } from "react";
import { apiPost } from "@/lib/client/api";
import { useIssuedAt } from "@/lib/client/hooks";
import { setReaderSession, type ReaderSession } from "@/lib/client/seals";
import { buttonStyles } from "./ui/Button";

function randomNonce(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Passport / identity check with nationality. Stores the reader session token in localStorage. */
export function ReaderVerify({
  onSession,
  label = "Verify nationality with World ID",
  countries,
}: {
  countries?: string[];
  onSession: (s: ReaderSession) => void | Promise<void>;
  label?: string;
}) {
  const issuedAt = useIssuedAt();
  const nonce = useMemo(() => (typeof crypto === "undefined" ? "" : randomNonce()), []);
  const signal = readerSignal(nonce, issuedAt);

  async function onVerified(proof: WorldProofEnvelope) {
    const s = await apiPost<ReaderSession>("/api/reader/session", { proof });
    setReaderSession(s);
    await onSession(s);
  }

  return (
    <WorldVerifyButton
      kind="reader"
      countries={countries}
      signal={signal}
      label={label}
      disabled={issuedAt === 0 || !nonce}
      className={buttonStyles({ variant: "primary", size: "md" })}
      onVerified={onVerified}
    />
  );
}
