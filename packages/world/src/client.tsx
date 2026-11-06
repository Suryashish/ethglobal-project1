"use client";
/**
 * WorldVerifyButton.
 *  - mock mode: a dark "World ID simulator (dev)" modal (Author / thief, nationality picker, fake face scan).
 *  - live mode: fetches a signed rp_context from `rpContextUrl`, then opens the IDKit 4.x widget
 *    (Selfie Check session for owner actions, Identity Check nationality for readers).
 * Cancel / error / unavailable credential all surface through `onError` and an inline message (the "alternative path").
 */
import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import type { RpContext } from "@worldcoin/idkit";
import { MOCK_IDENTITIES, MOCK_NATIONALITIES, type WorldKind, type WorldProofEnvelope } from "./types.js";

export type WorldClientConfig = {
  mode: "mock" | "live";
  appId?: string;
  environment?: "staging" | "production" | "sandbox";
  actionOwner?: string;
  actionReader?: string;
};

export type WorldVerifyButtonProps = {
  kind: WorldKind;
  signal: string;
  label: string;
  disabled?: boolean;
  className?: string;
  onVerified: (env: WorldProofEnvelope) => Promise<void> | void;
  onError?: (message: string) => void;
  /** Where to fetch the signed rp_context (live mode). Default `/api/world/rp-context`. */
  rpContextUrl?: string;
  /** Override env-derived config. */
  config?: WorldClientConfig;
  /**
   * Owner actions after arming: the saved Selfie Check session id (the seal's `ownerNullifier`).
   * Omit it when arming (a new session is created). If omitted for a non-arm action, the last session
   * created in this browser for the same seal is used.
   */
  sessionId?: string;
  /** Reader: allowed countries (ISO alpha-2) the reader can claim. Default: a built-in list. */
  countries?: string[];
};

// Direct process.env.NEXT_PUBLIC_* expressions so Next can inline them (no dynamic lookups).
function envConfig(): WorldClientConfig {
  const get = (f: () => string | undefined) => { try { return f(); } catch { return undefined; } };
  const mode = get(() => process.env.NEXT_PUBLIC_WORLD_MODE);
  const envName = get(() => process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT);
  return {
    mode: mode === "live" ? "live" : "mock",
    appId: get(() => process.env.NEXT_PUBLIC_WORLD_APP_ID),
    environment: envName === "production" || envName === "sandbox" ? envName : "staging",
    actionOwner: get(() => process.env.NEXT_PUBLIC_WORLD_ACTION_OWNER) || "iigs-owner",
    actionReader: get(() => process.env.NEXT_PUBLIC_WORLD_ACTION_READER) || "iigs-reader",
  };
}

const LiveWidget = lazy(() => import("./live.js"));

const SESSION_KEY = "iigs.world.session.";
function parseSignal(signal: string): { action: string; sealId: string } {
  const parts = signal.split("|"); // iigs|<action>|<sealId>|<extra>|<issuedAt>
  return { action: parts[1] ?? "", sealId: parts[2] ?? "" };
}
function lsGet(k: string): string | null { try { return window.localStorage.getItem(k); } catch { return null; } }
function lsSet(k: string, v: string) { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } }

// Paper-and-ink, matching the app (frontend/src/app/globals.css).
const css = `
.iigs-w-back{position:fixed;inset:0;background:rgba(42,36,27,.45);display:grid;place-items:center;z-index:2147483000;font-family:var(--font-plex-sans,ui-sans-serif),system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.iigs-w-card{width:min(380px,92vw);background:#fbf8f2;color:#1d1b17;border:1px solid #e3dacb;border-radius:18px;padding:24px;box-shadow:0 24px 60px -20px rgba(40,30,15,.45)}
.iigs-w-card h3{margin:0 0 4px;font-family:var(--font-newsreader,Georgia),Georgia,serif;font-size:24px;font-weight:400;line-height:1.15}
.iigs-w-sub{margin:0 0 16px;font-size:13.5px;color:#5f584e;line-height:1.5}
.iigs-w-tag{display:inline-block;font-size:12px;font-weight:500;color:#5f584e;background:#efe8db;border:1px solid #e3dacb;border-radius:6px;padding:2px 8px;margin-bottom:12px}
.iigs-w-opt{display:flex;gap:10px;align-items:center;padding:11px 12px;margin:6px 0;border:1px solid #e3dacb;border-radius:9px;cursor:pointer;background:#fffdf9;font-size:14px}
.iigs-w-opt[data-on="1"]{border-color:#1d1b17;box-shadow:0 0 0 1px #1d1b17}
.iigs-w-opt input{accent-color:#1d1b17}
.iigs-w-row{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}
.iigs-w-btn{border:1px solid #cec2ad;background:#fffdf9;color:#1d1b17;border-radius:9px;padding:9px 15px;font:inherit;font-size:14px;font-weight:500;cursor:pointer}
.iigs-w-btn:hover{border-color:#776e61}
.iigs-w-btn[data-primary="1"]{background:#1d1b17;border-color:#1d1b17;color:#fbf8f2}
.iigs-w-btn[data-primary="1"]:hover{background:#3b3731}
.iigs-w-btn:disabled{opacity:.5;cursor:default}
.iigs-w-err{margin:10px 0 0;font-size:13px;color:#b3261e}
.iigs-w-sel{width:100%;margin-top:6px;background:#fffdf9;color:#1d1b17;border:1px solid #e3dacb;border-radius:9px;padding:9px 10px;font:inherit;font-size:14px}
.iigs-w-chk{display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13px;color:#5f584e}
.iigs-w-scan{display:grid;place-items:center;padding:14px 0 6px}
.iigs-w-ring{width:120px;height:120px;border-radius:50%;border:2px solid #1d1b17;position:relative;overflow:hidden;background:radial-gradient(circle at 50% 38%,#e3dacb 0 28%,#efe8db 29%)}
.iigs-w-ring::after{content:"";position:absolute;left:0;right:0;height:2px;background:#2e6a48;animation:iigs-w-scan 1.1s ease-in-out infinite alternate}
@keyframes iigs-w-scan{from{top:8%}to{top:88%}}
.iigs-w-msg{text-align:center;margin-top:12px;font-size:14px;color:#3b3731}
`;

function Modal(props: { children: React.ReactNode }) {
  return (
    <div className="iigs-w-back" role="dialog" aria-modal="true">
      <style>{css}</style>
      <div className="iigs-w-card">{props.children}</div>
    </div>
  );
}

export function WorldVerifyButton(props: WorldVerifyButtonProps) {
  const cfg = props.config ?? envConfig();
  const live = cfg.mode === "live";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // mock state
  const [identity, setIdentity] = useState<string>("author");
  const [nationality, setNationality] = useState<string>("IN");
  const [scanning, setScanning] = useState(false);
  const [noCredential, setNoCredential] = useState(false);

  // live state
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [picking, setPicking] = useState(false);
  const [liveNationality, setLiveNationality] = useState<string>("");
  const [liveOpen, setLiveOpen] = useState(false);
  const countries = props.countries && props.countries.length ? props.countries : [...MOCK_NATIONALITIES];

  function fail(msg: string) {
    setError(msg);
    props.onError?.(msg);
  }

  // ---------- mock ----------
  async function submitMock() {
    setBusy(true);
    setError(null);
    try {
      if (noCredential) {
        throw new Error(props.kind === "owner"
          ? "Selfie Check is not available for this World ID. Open World App, complete Selfie Check, then try again."
          : "No passport credential with a nationality is available for this World ID.");
      }
      if (props.kind === "owner") {
        setScanning(true);
        await new Promise((r) => setTimeout(r, 1500));
      }
      await props.onVerified({
        mode: "mock",
        kind: props.kind,
        signal: props.signal,
        result: props.kind === "reader" ? { identity, nationality } : { identity },
      });
      setOpen(false);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
      setBusy(false);
    }
  }

  // ---------- live ----------
  async function startLive(nat?: string) {
    setBusy(true);
    setError(null);
    try {
      if (!cfg.appId) throw new Error("World ID is not configured (NEXT_PUBLIC_WORLD_APP_ID is missing).");
      const res = await fetch(props.rpContextUrl ?? "/api/world/rp-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // readers declare the nationality up front: the server binds it to this request's nonce
        body: JSON.stringify({ kind: props.kind, signal: props.signal, ...(props.kind === "reader" && nat ? { nationality: nat } : {}) }),
      });
      const body = (await res.json().catch(() => null)) as (RpContext & { message?: string; error?: string }) | null;
      if (!res.ok || !body || !body.nonce) throw new Error(body?.message || body?.error || `Could not start World ID (HTTP ${res.status}).`);
      setRpContext(body);
      if (nat) setLiveNationality(nat);
      setLiveOpen(true);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onClick() {
    setError(null);
    if (!live) { setOpen(true); return; }
    if (props.kind === "reader") { setLiveNationality(countries[0] ?? ""); setPicking(true); return; }
    void startLive();
  }

  const { action, sealId } = parseSignal(props.signal);
  const sessionId = props.sessionId ?? (action !== "arm" && sealId ? lsGet(SESSION_KEY + sealId) ?? undefined : undefined);

  async function onLiveResult(env: WorldProofEnvelope) {
    await props.onVerified(env);
    // remember the session created at arm time so later owner actions on this device can prove it
    const sid = (env.result as { session_id?: unknown } | null)?.session_id;
    if (props.kind === "owner" && action === "arm" && sealId && typeof sid === "string") lsSet(SESSION_KEY + sealId, sid);
  }

  const showErrorInline = error && !open && !picking;
  const dis = props.disabled || busy || liveOpen;

  return (
    <>
      <button type="button" className={props.className} disabled={dis} onClick={onClick}>
        {busy && !open ? "Verifying…" : props.label}
      </button>
      {showErrorInline ? <p role="alert" style={{ color: "#f87171", fontSize: 13, marginTop: 6 } as CSSProperties}>{error}</p> : null}

      {mounted && live && picking ? (
        <Modal>
          <span className="iigs-w-tag">World ID</span>
          <h3>Prove your nationality</h3>
          <p className="iigs-w-sub">Your World ID attests only whether you hold a passport of the country you pick. No name, no birthdate.</p>
          <select className="iigs-w-sel" value={liveNationality} onChange={(e) => setLiveNationality(e.target.value)}>
            {countries.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="iigs-w-row">
            <button type="button" className="iigs-w-btn" onClick={() => setPicking(false)}>Cancel</button>
            <button type="button" className="iigs-w-btn" data-primary="1" disabled={busy || !liveNationality}
              onClick={() => { setPicking(false); void startLive(liveNationality); }}>Continue</button>
          </div>
        </Modal>
      ) : null}

      {mounted && live && liveOpen && rpContext && cfg.appId ? (
        <Suspense fallback={null}>
          <LiveWidget
            kind={props.kind}
            signal={props.signal}
            rpContext={rpContext}
            config={{ appId: cfg.appId, environment: cfg.environment ?? "staging", actionReader: cfg.actionReader ?? "iigs-reader" }}
            sessionId={sessionId}
            nationality={liveNationality}
            onResult={onLiveResult}
            onFail={(m) => fail(m)}
            onClose={() => { setLiveOpen(false); setRpContext(null); }}
          />
        </Suspense>
      ) : null}

      {mounted && !live && open ? (
        <Modal>
          <span className="iigs-w-tag">Dev only</span>
          <h3>World ID simulator (dev)</h3>
          {scanning ? (
            <>
              <div className="iigs-w-scan"><div className="iigs-w-ring" /></div>
              <p className="iigs-w-msg">Scanning face…</p>
            </>
          ) : (
            <>
              <p className="iigs-w-sub">
                {props.kind === "owner"
                  ? "Selfie Check: who is in front of the camera right now?"
                  : "Passport check: which nationality does the reader prove?"}
              </p>
              {MOCK_IDENTITIES.map((i) => (
                <label key={i.id} className="iigs-w-opt" data-on={identity === i.id ? "1" : "0"}>
                  <input type="radio" name="iigs-mock-id" checked={identity === i.id} onChange={() => setIdentity(i.id)} />
                  {i.label}
                </label>
              ))}
              {props.kind === "reader" ? (
                <label style={{ display: "block", marginTop: 12, fontSize: 13, color: "#5f584e" }}>
                  Nationality
                  <select className="iigs-w-sel" value={nationality} onChange={(e) => setNationality(e.target.value)}>
                    {MOCK_NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="iigs-w-chk">
                <input type="checkbox" checked={noCredential} onChange={(e) => setNoCredential(e.target.checked)} />
                Simulate: credential unavailable on this World ID
              </label>
            </>
          )}
          {error ? <p role="alert" className="iigs-w-err">{error}</p> : null}
          <div className="iigs-w-row">
            <button type="button" className="iigs-w-btn" disabled={busy} onClick={() => { setOpen(false); setError(null); props.onError?.("Verification cancelled."); }}>Cancel</button>
            <button type="button" className="iigs-w-btn" data-primary="1" disabled={busy} onClick={submitMock}>{busy ? "Verifying…" : "Verify"}</button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
