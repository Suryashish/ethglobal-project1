"use client";
/**
 * WorldVerifyButton. STUB: mock mode only (a dev "World ID simulator" modal).
 * Live mode (IDKit widget) is added by the World integration.
 */
import { useState } from "react";
import { MOCK_IDENTITIES, MOCK_NATIONALITIES, type WorldKind, type WorldProofEnvelope } from "./types.js";

export type WorldVerifyButtonProps = {
  kind: WorldKind;
  signal: string;
  label: string;
  disabled?: boolean;
  className?: string;
  onVerified: (env: WorldProofEnvelope) => Promise<void> | void;
  onError?: (message: string) => void;
};

export function WorldVerifyButton(props: WorldVerifyButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<string>("author");
  const [nationality, setNationality] = useState<string>("IN");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await props.onVerified({
        mode: "mock",
        kind: props.kind,
        signal: props.signal,
        result: props.kind === "reader" ? { identity, nationality } : { identity },
      });
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      props.onError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={props.className} disabled={props.disabled || busy} onClick={() => setOpen(true)}>
        {busy ? "Verifying…" : props.label}
      </button>
      {error && !open ? <p role="alert" style={{ color: "#f87171", fontSize: 13, marginTop: 6 }}>{error}</p> : null}
      {open ? (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div style={{ background: "#111", color: "#eee", padding: 20, borderRadius: 12, width: 360, fontFamily: "system-ui" }}>
            <h3 style={{ margin: "0 0 4px" }}>World ID simulator (dev)</h3>
            <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 12px" }}>
              {props.kind === "owner" ? "Selfie Check — who is in front of the camera?" : "Passport check — reader nationality"}
            </p>
            {MOCK_IDENTITIES.map((i) => (
              <label key={i.id} style={{ display: "block", margin: "6px 0" }}>
                <input type="radio" name="iigs-mock-id" checked={identity === i.id} onChange={() => setIdentity(i.id)} /> {i.label}
              </label>
            ))}
            {props.kind === "reader" ? (
              <label style={{ display: "block", marginTop: 10 }}>
                Nationality{" "}
                <select value={nationality} onChange={(e) => setNationality(e.target.value)}>
                  {MOCK_NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            ) : null}
            {error ? <p role="alert" style={{ color: "#f87171", fontSize: 13 }}>{error}</p> : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
              <button type="button" onClick={submit} disabled={busy}>{busy ? "Verifying…" : "Verify"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
