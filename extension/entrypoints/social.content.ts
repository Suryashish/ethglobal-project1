import { browser } from "wxt/browser";
import { selectCard, type ReaderCtx } from "../lib/card";
import { buildCard, CARD_CSS, type DecState } from "../lib/cardView";
import { decryptFromB64 } from "../lib/decrypt";
import { expiresAtMs, formatCountdown, nowSec } from "../lib/format";
import { closestEditable, copyToClipboard, findEditable, insertIntoEditable, toast } from "../lib/insert";
import { send, type ScanSummary, type TabMsg } from "../lib/messages";
import { MARK, scanRoot } from "../lib/scan";
import type { WireState } from "../lib/wire";

const E2E = import.meta.env.VITE_IIGS_E2E === "1";

type Entry = { state: WireState | null | undefined; dec?: DecState; busy?: boolean; lastKind?: string };
/** `covert` ids came from a hidden cover phrase: no card at all until the seal has opened. */
type Host = { el: Element; ids: string[]; covert: Set<string>; host: HTMLElement; root: ShadowRoot; visible: boolean };

/** Most seals tracked per page: a page stuffed with phrases cannot make every viewer issue unbounded lookups. */
const MAX_TRACKED = 200;

const isOpen = (kind: string) => kind === "open-public" || kind === "open-gated";

export default defineContentScript({
  matches: [
    "https://x.com/*",
    "https://twitter.com/*",
    "https://www.reddit.com/*",
    "https://old.reddit.com/*",
    ...(E2E ? ["http://localhost:4010/*"] : []),
  ],
  main() {
    const entries = new Map<string, Entry>();
    const seenEls = new Set<Element>();
    const seen = {
      has: (el: Element) => seenEls.has(el),
      list: () => {
        for (const el of seenEls) if (!el.isConnected) seenEls.delete(el);
        return [...seenEls];
      },
    };
    const hosts: Host[] = [];
    let reader: ReaderCtx = null;
    let lastEditable: HTMLElement | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    // ---- composer tracking + insertion ----
    document.addEventListener(
      "focusin",
      (e) => {
        const ed = closestEditable(e.target);
        if (ed) lastEditable = ed;
      },
      true,
    );
    browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
      const m = raw as TabMsg;
      if (m?.type === "iigs-scan") {
        void manualScan().then(sendResponse, () => sendResponse({ found: 0, opened: 0, decrypted: 0 }));
        return true;
      }
      if (!m || m.type !== "iigs-insert") return false;
      void (async () => {
        const ed = findEditable(document, lastEditable);
        if (ed) {
          const r = insertIntoEditable(document, ed, m.text);
          if (r.inserted) return sendResponse(r);
        }
        const copied = await copyToClipboard(document, m.text);
        toast(document, copied ? "Hidden post copied — paste it" : "Could not insert. Copy it from the Silent Seal popup.");
        sendResponse({ inserted: false, method: copied ? "clipboard" : "none" });
      })();
      return true;
    });

    // ---- reader context ----
    async function loadContext() {
      const c = await send({ type: "context" });
      if (c.ok) {
        reader = c.reader ? { nationality: c.reader.nationality, expiresAtMs: expiresAtMs(c.reader.expiresAt) } : null;
      }
    }

    // ---- rendering ----
    function modelFor(id: string) {
      return selectCard(entries.get(id)?.state, nowSec(), reader);
    }

    function renderHost(h: Host) {
      h.root.replaceChildren();
      const style = document.createElement("style");
      style.textContent = CARD_CSS;
      h.root.append(style);
      let any = false;
      for (const id of h.ids) {
        const e = entries.get(id);
        const model = modelFor(id);
        e && (e.lastKind = model.kind);
        if (h.covert.has(id) && !isOpen(model.kind)) continue; // hidden post: stay invisible until it opens
        const card = buildCard(document, id, {
          model,
          dec: e?.dec,
          onVerify: () => void send({ type: "open-verify" }),
        });
        if (card) {
          h.root.append(card);
          any = true;
        }
      }
      h.host.style.display = any ? "block" : "none";
      h.visible = any;
      // A hidden post's card is only put into the page once there is something to show: before it opens,
      // the page carries no trace of the extension (no marker, no hidden element the site could detect).
      if (any && !h.host.isConnected && h.el.isConnected) h.el.insertAdjacentElement("afterend", h.host);
      if (!any && h.host.isConnected && h.ids.every((id) => h.covert.has(id))) h.host.remove();
    }
    const renderAll = () => hosts.forEach(renderHost);
    const renderFor = (id: string) => hosts.filter((h) => h.ids.includes(id)).forEach(renderHost);

    // ---- decrypt orchestration ----
    async function maybeDecrypt(id: string) {
      const e = entries.get(id);
      if (!e || !e.state || e.busy) return;
      if (e.dec && (e.dec.status === "ok" || e.dec.status === "file" || e.dec.status === "denied" || e.dec.status === "loading")) return;
      if (e.dec?.status === "error" && e.dec.retryAt > nowSec()) return;
      const model = modelFor(id);
      let keyB64: string | undefined;
      if (model.kind === "open-public") {
        keyB64 = e.state.release?.releasedKeyB64;
        if (!keyB64) return fail(id, "Released, but the key is not published yet — retrying…", 10);
      } else if (model.kind === "open-gated" && model.reader === "verified") {
        e.busy = true;
        e.dec = { status: "loading" };
        renderFor(id);
        const r = await send({ type: "reader-key", sealId: id });
        e.busy = false;
        if (!r.ok) {
          if (r.code === "not_in_country") {
            e.dec = { status: "denied" };
            return renderFor(id);
          }
          return fail(id, r.code === "not_released" ? "Released, key service not ready yet — retrying…" : r.error, 10);
        }
        keyB64 = r.keyB64;
      } else return;

      e.busy = true;
      e.dec = { status: "loading" };
      renderFor(id);
      try {
        const seal = e.state.seal;
        let cipherB64 = seal.cipherInlineB64 ?? (typeof seal.cipherInline === "string" ? seal.cipherInline : undefined);
        if (!cipherB64 && seal.swarmRef) {
          const c = await send({ type: "fetch-cipher", ref: seal.swarmRef });
          if (!c.ok) throw new Error(c.error);
          cipherB64 = c.b64;
        }
        if (!cipherB64) throw new Error("ciphertext not available");
        if (!seal.contentHash) throw new Error("the seal has no content hash; refusing to decrypt unverified data");
        const d = decryptFromB64(id, keyB64, cipherB64, seal.contentHash);
        e.dec = d.kind === "text" ? { status: "ok", text: d.text } : { status: "file", name: d.name, size: d.size };
      } catch (err) {
        e.dec = { status: "error", msg: err instanceof Error ? err.message : String(err), retryAt: nowSec() + 20 };
      }
      e.busy = false;
      renderFor(id);
    }
    function fail(id: string, msg: string, retrySec: number) {
      const e = entries.get(id)!;
      e.dec = { status: "error", msg, retryAt: nowSec() + retrySec };
      renderFor(id);
    }

    // ---- state fetching ----
    async function fetchStates(ids: string[], force: boolean) {
      if (!ids.length) return;
      const r = await send({ type: "states", ids, force });
      if (!r.ok) return;
      for (const id of ids) {
        const prev = entries.get(id) ?? { state: undefined };
        prev.state = r.states[id] ?? null;
        entries.set(id, prev);
      }
      ids.forEach(renderFor);
      await Promise.all(ids.map((id) => maybeDecrypt(id)));
    }

    /** Popup "Scan this page": rescan now, refresh every seal on the page, decrypt what has opened. */
    async function manualScan(): Promise<ScanSummary> {
      scan();
      const ids = [...new Set(hosts.flatMap((h) => h.ids))];
      await fetchStates(ids, true);
      const opened = ids.filter((id) => isOpen(modelFor(id).kind));
      return {
        found: ids.length,
        opened: opened.length,
        decrypted: opened.filter((id) => entries.get(id)?.dec?.status === "ok").length,
      };
    }

    // ---- scanning ----
    function scan() {
      for (const h of hosts) {
        // re-insert hosts that the site's re-render dropped
        if (h.visible && h.el.isConnected && !h.host.isConnected) h.el.insertAdjacentElement("afterend", h.host);
      }
      for (let i = hosts.length - 1; i >= 0; i--) if (!hosts[i]!.el.isConnected) hosts.splice(i, 1);
      const fresh: string[] = [];
      for (const f of scanRoot(document, seen)) {
        if (entries.size >= MAX_TRACKED && f.ids.every((id) => !entries.has(id))) continue;
        const covertOnly = f.ids.every((id) => f.covert.has(id));
        if (covertOnly) seenEls.add(f.el); // no DOM marker for hidden posts
        else f.el.setAttribute(MARK, f.ids.join(","));
        const host = document.createElement("div");
        host.setAttribute("data-iigs-card", f.ids.join(","));
        // Reddit renders posts as web components: a slotted title only shows siblings in the same slot.
        const slot = f.el.getAttribute("slot");
        if (slot) host.setAttribute("slot", slot);
        host.style.display = "none";
        // closed: the site's scripts cannot read the decrypted text out of the card (open only in e2e builds, for tests)
        const root = host.attachShadow({ mode: E2E ? "open" : "closed" });
        if (!covertOnly) f.el.insertAdjacentElement("afterend", host);
        hosts.push({ el: f.el, ids: f.ids, covert: f.covert, host, root, visible: !covertOnly });
        for (const id of f.ids) {
          if (!entries.has(id)) {
            entries.set(id, { state: undefined });
            fresh.push(id);
          } else if (entries.get(id)!.state !== undefined) renderFor(id);
        }
      }
      if (fresh.length) void fetchStates([...new Set(fresh)], false);
    }
    const schedule = () => {
      clearTimeout(debounce);
      debounce = setTimeout(scan, 300);
    };

    // ---- timers ----
    setInterval(() => {
      const now = nowSec();
      for (const h of hosts) {
        h.root.querySelectorAll<HTMLElement>("[data-deadline]").forEach((n) => {
          const left = Number(n.getAttribute("data-deadline")) - now;
          const heartbeat = n.getAttribute("data-rule") === "HEARTBEAT";
          const when = formatCountdown(left);
          n.textContent = heartbeat ? `🔒 Sealed · opens in ${when} unless the author checks in` : `🔒 Sealed · opens in ${when}`;
        });
      }
      for (const [id, e] of entries) {
        if (e.lastKind && e.state !== undefined && modelFor(id).kind !== e.lastKind) renderFor(id);
        void maybeDecrypt(id);
      }
    }, 1000);
    setInterval(() => {
      const ids = [...entries].filter(([, e]) => e.state && (e.state.status === "ARMED" || e.state.status === "RELEASING")).map(([id]) => id);
      void fetchStates(ids, true);
    }, 30_000);
    // a released-but-not-yet-seen seal is refreshed soon after its deadline passes
    setInterval(() => {
      const now = nowSec();
      const ids = [...entries]
        .filter(([, e]) => e.state && e.state.status === "ARMED" && e.state.nextDeadline && e.state.nextDeadline <= now)
        .map(([id]) => id);
      void fetchStates(ids, true);
    }, 8_000);

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.reader) return;
      void loadContext().then(() => {
        for (const [, e] of entries) if (e.dec && e.dec.status !== "ok") e.dec = undefined;
        renderAll();
        for (const id of entries.keys()) void maybeDecrypt(id);
      });
    });

    void loadContext().then(() => {
      scan();
      new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    });
  },
});
