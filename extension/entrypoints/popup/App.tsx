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
  const [preset, setPreset] = useState<string>("300");
  const [custom, setCustom] = useState(localInputValue(Date.now() + 3600_000));
  const [hbOn, setHbOn] = useState(false);
  const [hb, setHb] = useState("300");
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

  return (
    <>
      <h1>🔒 Silent Seal</h1>
      <div className="sub">Seal a post. It opens at a set time unless you disarm it.</div>

      <section>
        <h2>Read hidden posts</h2>
        <div className="sub">Sealed posts look like ordinary text. Once one opens, its message appears right under it.</div>
        <div style={{ marginTop: 8 }} className="row">
          <button data-testid="scan-page" disabled={scanning} onClick={scanPage}>
            {scanning ? "Scanning…" : "Scan this page"}
          </button>
        </div>
        {scanMsg && <div className="okmsg" data-testid="scan-result">{scanMsg}</div>}
      </section>

      <section>
        <h2>New sealed post</h2>
        <textarea placeholder="What should open later?" value={text} onChange={(e) => setText(e.target.value)} />
        <label>Opens in</label>
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
        <label>
          <input type="checkbox" style={{ width: "auto" }} checked={hbOn} onChange={(e) => setHbOn(e.target.checked)} /> also open early if I go silent for…
        </label>
        {hbOn && (
          <select value={hb} onChange={(e) => setHb(e.target.value)}>
            {HEARTBEAT_PRESETS.map(([l, s]) => (
              <option key={s} value={s}>
                {l}
              </option>
            ))}
          </select>
        )}
        <label>Only verified readers from (optional)</label>
        <div>
          {countries.map((c) => (
            <span className="chip" key={c}>
              {label(c)} <button onClick={() => toggleCountry(c)} aria-label={`remove ${c}`}>×</button>
            </span>
          ))}
        </div>
        <select
          value=""
          onChange={(e) => e.target.value && !countries.includes(e.target.value) && setCountries([...countries, e.target.value])}
        >
          <option value="">{countries.length ? "Add another country…" : "Anyone (public) — or add a country…"}</option>
          {COUNTRIES.map(([c, n]) => (
            <option key={c} value={c}>
              {flag(c)} {c} · {n}
            </option>
          ))}
        </select>
        <div style={{ marginTop: 10 }} className="row">
          <button disabled={busy || !text.trim()} onClick={seal}>
            {busy ? "Sealing…" : "Seal"}
          </button>
        </div>
        {hbOn && <div className="sub">Early open if no check-in for {formatDuration(Number(hb))}.</div>}
        {error && <div className="err">{error}</div>}
        {info && <div className="okmsg">{info}</div>}
      </section>

      <section>
        <h2>My sealed posts</h2>
        {!mine.length && <div className="sub">Nothing yet.</div>}
        {mine.map((p) => {
          const s = states[p.sealId];
          return (
            <div className="post" key={p.sealId}>
              <div className="row">
                <code>{p.sealId}</code>
                <span className={`status ${s?.status ?? ""}`} style={{ flex: "none" }}>
                  {s ? s.status : "…"}
                </span>
              </div>
              {s?.status === "ARMED" && s.nextDeadline && <div className="sub">opens in {formatCountdown(s.nextDeadline - nowSec())}</div>}
              <div className="row" style={{ marginTop: 4 }}>
                <button className="ghost small" onClick={() => copy(p.post)}>Copy hidden post</button>
                <button className="ghost small" onClick={() => insert(p.post)}>Insert into current page</button>
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 8 }}>
          <button className="ghost" onClick={() => send({ type: "open-vault" })}>Open dashboard</button>
        </div>
      </section>

      <section>
        <h2>Reader verification</h2>
        {readerValid ? (
          <div>
            ✅ Verified nationality: {label(reader!.nationality)} <span className="sub">· expires in {formatCountdown((expiresAtMs(reader!.expiresAt) - Date.now()) / 1000)}</span>
          </div>
        ) : (
          <div className="sub">Not verified. Needed to open country-gated seals.</div>
        )}
        <div style={{ marginTop: 6 }}>
          <button className="ghost" onClick={() => send({ type: "open-verify" })}>Verify nationality</button>
        </div>
      </section>

      <section>
        <h2>Settings</h2>
        <label style={{ marginTop: 0 }}>Silent Seal web app URL</label>
        <div className="row">
          <input value={baseDraft} onChange={(e) => setBaseDraft(e.target.value)} />
          <button className="small" onClick={saveBase} disabled={baseDraft === baseUrl}>Save</button>
        </div>
      </section>
    </>
  );
}
