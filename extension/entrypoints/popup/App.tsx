import { useCallback, useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";
import { InlineTooLongError, buildDraft } from "../../lib/compose";
import { COUNTRIES, flag, label } from "../../lib/countries";
import { expiresAtMs, formatCountdown, formatDuration, nowSec } from "../../lib/format";
import { send, type ScanSummary, type TabMsg } from "../../lib/messages";
import { DEFAULT_BASE_URL, get, set, type MyPost, type ReaderToken } from "../../lib/storage";
import type { WireState } from "../../lib/wire";

const OPEN_PRESETS: Array<[string, number]> = [
  ["2 min", 120],
  ["5 min", 300],
  ["1 hour", 3600],
  ["1 day", 86400],
  ["5 days", 5 * 86400],
];
const HEARTBEAT_PRESETS: Array<[string, number]> = [
  ["1 min", 60],
  ["5 min", 300],
  ["1 hour", 3600],
  ["1 day", 86400],
  ["7 days", 7 * 86400],
];

function localInputValue(ms: number) {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export default function App() {
  const [text, setText] = useState("");
  const [preset, setPreset] = useState<string>("86400");
  const [custom, setCustom] = useState(localInputValue(Date.now() + 3600_000));
  const [hbOn, setHbOn] = useState(false);
  const [hb, setHb] = useState("86400");
  const [countries, setCountries] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");

  const [mine, setMine] = useState<MyPost[]>([]);
  const [states, setStates] = useState<Record<string, WireState | null>>({});
  const [reader, setReader] = useState<ReaderToken | null>(null);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [baseDraft, setBaseDraft] = useState(DEFAULT_BASE_URL);

  const load = useCallback(async () => {
    const [m, r, b] = await Promise.all([get("mine"), get("reader"), get("baseUrl")]);
    setMine(m ?? []);
    setReader(r ?? null);
    setBaseUrl(b || DEFAULT_BASE_URL);
    setBaseDraft(b || DEFAULT_BASE_URL);
  }, []);

  useEffect(() => {
    void load();
    const l = (_c: unknown, area: string) => area === "local" && void load();
    browser.storage.onChanged.addListener(l);
    return () => browser.storage.onChanged.removeListener(l);
  }, [load]);

  useEffect(() => {
    if (!mine.length) return;
    void send({ type: "states", ids: mine.map((p) => p.sealId) }).then((r) => r.ok && setStates(r.states));
  }, [mine]);

  const readerValid = reader && expiresAtMs(reader.expiresAt) > Date.now();

  const releaseAt = useMemo(() => {
    if (preset === "custom") return Math.floor(new Date(custom).getTime() / 1000);
    return nowSec() + Number(preset);
  }, [preset, custom]);

  async function seal() {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (preset === "custom" && releaseAt <= nowSec() + 30) throw new Error("Pick a time in the future.");
      const cfg = await send({ type: "refresh-config" });
      if (!cfg.ok) throw new Error(`Could not reach ${baseUrl}: ${cfg.error}`);
      const draft = buildDraft(
        { text, releaseAt: preset === "custom" ? releaseAt : nowSec() + Number(preset), heartbeatSec: hbOn ? Number(hb) : 0, countries },
        cfg.config,
      );
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const r = await send({ type: "start-arm", draft, tabId: tab?.id ?? null });
      if (!r.ok) throw new Error(r.error);
      setInfo("Sealed on this device. Finish the World ID face check in the new tab.");
      setText("");
    } catch (e) {
      setError(e instanceof InlineTooLongError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Asks the X / Reddit tab to find hidden posts, refresh them and decrypt the ones that have opened. */
  async function scanPage() {
    setScanning(true);
    setScanMsg("");
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) throw new Error("no tab");
      const r = (await browser.tabs.sendMessage(tab.id, { type: "iigs-scan" } satisfies TabMsg)) as ScanSummary | undefined;
      if (!r) throw new Error("no reply");
      const plural = (n: number) => (n === 1 ? "" : "s");
      if (!r.opened) setScanMsg("No opened sealed posts on this page.");
      else {
        const waiting = r.opened - r.decrypted;
        setScanMsg(
          `Opened ${r.opened} sealed post${plural(r.opened)}` +
            (r.decrypted ? ` — the message is shown under ${r.decrypted === 1 ? "it" : "each one"}.` : ".") +
            (waiting ? ` ${waiting} need${waiting === 1 ? "s" : ""} nationality verification or is still decrypting.` : ""),
        );
      }
    } catch {
      setScanMsg("Open X or Reddit, then scan.");
    } finally {
      setScanning(false);
    }
  }

  async function insert(post: string) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const r = await send({ type: "insert", text: post, tabId: tab?.id });
    if (r.ok && r.inserted) setInfo("Inserted into the page.");
    else {
      await navigator.clipboard.writeText(post).catch(() => {});
      setInfo("Could not insert — hidden post copied, paste it.");
    }
  }

  async function copy(post: string) {
    await navigator.clipboard.writeText(post);
    setInfo("Hidden post copied.");
  }

  async function saveBase() {
    setError("");
    try {
      const url = new URL(baseDraft.trim());
      const origin = url.origin;
      if (origin !== DEFAULT_BASE_URL) {
        const ok = await browser.permissions.request({ origins: [origin + "/*"] });
        if (!ok) throw new Error("Permission to access that site was denied.");
      }
      await set("baseUrl", origin);
      await send({ type: "apply-base-url" });
      setInfo(`Using ${origin}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const toggleCountry = (c: string) => setCountries((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));

  const STATUS_LABEL: Record<string, string> = { ARMED: "Armed", RELEASING: "Releasing", RELEASED: "Opened", DISARMED: "Disarmed" };
  const statusLabel = (st?: string) => (st ? STATUS_LABEL[st] ?? st : "…");

  return (
    <>
      <header className="top">
        <Mark />
        <div className="brandtxt">
          <h1>Silent Seal</h1>
          <div className="sub">Posts that open if you go silent</div>
        </div>
        <span className={`pill ${readerValid ? "ok" : ""}`} title={readerValid ? "Verified reader" : "Not verified as a reader"}>
          <i />
          {readerValid ? label(reader!.nationality) : "Reader"}
        </span>
      </header>

      <section className="card hero">
        <div className="eyebrow">New sealed post</div>
        <textarea placeholder="What should open later?" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="field">
          <span className="lbl">Opens in</span>
          <div className="row">
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {OPEN_PRESETS.map(([l, s]) => (
                <option key={s} value={s}>
                  {l}
                </option>
              ))}
              <option value="custom">Custom date &amp; time…</option>
            </select>
            {preset === "custom" && <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />}
          </div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={hbOn} onChange={(e) => setHbOn(e.target.checked)} />
          <span className="track" aria-hidden />
          <span>Open early if I go silent</span>
        </label>
        {hbOn && (
          <div className="field">
            <span className="lbl">Silent for</span>
            <select value={hb} onChange={(e) => setHb(e.target.value)}>
              {HEARTBEAT_PRESETS.map(([l, s]) => (
                <option key={s} value={s}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <span className="lbl">Readers</span>
          {countries.length > 0 && (
            <div className="chips">
              {countries.map((c) => (
                <span className="chip" key={c}>
                  {label(c)} <button onClick={() => toggleCountry(c)} aria-label={`remove ${c}`}>×</button>
                </span>
              ))}
            </div>
          )}
          <select
            value=""
            onChange={(e) => e.target.value && !countries.includes(e.target.value) && setCountries([...countries, e.target.value])}
          >
            <option value="">{countries.length ? "Add another country…" : "Anyone (public) — or limit to a country…"}</option>
            {COUNTRIES.map(([c, n]) => (
              <option key={c} value={c}>
                {flag(c)} {c} · {n}
              </option>
            ))}
          </select>
        </div>
        <button className="primary block" disabled={busy || !text.trim()} onClick={seal}>
          <LockIcon /> {busy ? "Sealing…" : "Seal post"}
        </button>
        {hbOn && <div className="hint">Opens early if there is no check-in for {formatDuration(Number(hb))}.</div>}
        {error && <div className="msg err">{error}</div>}
        {info && <div className="msg ok">{info}</div>}
      </section>

      <section className="card">
        <div className="split">
          <div>
            <div className="eyebrow">Read hidden posts</div>
            <div className="sub">Opened seals show their message under the post.</div>
          </div>
          <button className="ghost" data-testid="scan-page" disabled={scanning} onClick={scanPage}>
            {scanning ? "Scanning…" : "Scan this page"}
          </button>
        </div>
        {scanMsg && <div className="msg ok" data-testid="scan-result">{scanMsg}</div>}
      </section>

      <section className="card">
        <div className="split">
          <div className="eyebrow">My sealed posts</div>
          <button className="link" onClick={() => send({ type: "open-vault" })}>All your seals ↗</button>
        </div>
        {!mine.length && <div className="empty">Nothing sealed yet.</div>}
        {mine.map((p) => {
          const s = states[p.sealId];
          return (
            <div className="post" key={p.sealId}>
              <div className="split">
                <span className={`status ${s?.status ?? ""}`}>
                  <i />
                  {statusLabel(s?.status)}
                </span>
                <code>{p.sealId}</code>
              </div>
              {s?.status === "ARMED" && s.nextDeadline && (
                <div className="count">
                  {s.nextDeadlineRule === "HEARTBEAT" ? "check in within " : "opens in "}
                  {formatCountdown(s.nextDeadline - nowSec())}
                </div>
              )}
              <div className="actions">
                <button className="ghost small" onClick={() => copy(p.post)}>Copy hidden post</button>
                <button className="ghost small" onClick={() => insert(p.post)}>Insert into current page</button>
              </div>
              <div className="links">
                <button className="link" onClick={() => send({ type: "open-seal", sealId: p.sealId })}>Seal page ↗</button>
                {s?.status === "ARMED" && (s.seal.intervalSec ?? 0) > 0 && (
                  <button className="link strong" onClick={() => send({ type: "open-vault" })}>Check in (I&apos;m OK) ↗</button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="card">
        <div className="split">
          <div>
            <div className="eyebrow">Reader verification</div>
            {readerValid ? (
              <div className="sub">
                Verified {label(reader!.nationality)} · expires in {formatCountdown((expiresAtMs(reader!.expiresAt) - Date.now()) / 1000)}
              </div>
            ) : (
              <div className="sub">Needed to open country-gated seals.</div>
            )}
          </div>
          <button className="ghost" onClick={() => send({ type: "open-verify" })}>Verify nationality</button>
        </div>
      </section>

      <details className="card settings">
        <summary>Settings</summary>
        <span className="lbl">Silent Seal web app URL</span>
        <div className="row">
          <input value={baseDraft} onChange={(e) => setBaseDraft(e.target.value)} />
          <button className="small" onClick={saveBase} disabled={baseDraft === baseUrl}>Save</button>
        </div>
      </details>
    </>
  );
}

/** Same mark as the web app: a wax seal with a heartbeat pressed into it. */
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id="wax" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#c44a3e" />
          <stop offset="0.55" stopColor="#a8352b" />
          <stop offset="1" stopColor="#7d241c" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#wax)" />
      <circle cx="32" cy="32" r="21.5" fill="none" stroke="#7a221a" strokeOpacity="0.55" strokeWidth="1.8" />
      <path d="M14 34h8.5l4.2-11 7 20 4.3-9H50" fill="none" stroke="#6e1d16" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
