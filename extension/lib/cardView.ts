import { label } from "./countries";
import { sealedLine, type CardModel } from "./card";
import { nowSec } from "./format";

export type DecState =
  | { status: "loading" }
  | { status: "ok"; text: string }
  | { status: "file"; name: string; size: number }
  | { status: "denied" }
  | { status: "error"; msg: string; retryAt: number };

export const CARD_CSS = `
:host{all:initial;display:block;margin:8px 0}
*{box-sizing:border-box}
.card{font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#e8eaf6;background:#161a2e;border:1px solid #3b3f73;border-left:4px solid #6366f1;border-radius:10px;padding:9px 12px;max-width:100%}
.card.cancelled{border-left-color:#ef4444}.card.releasing{border-left-color:#f59e0b}.card.open{border-left-color:#22c55e}.card.gated{border-left-color:#06b6d4}
.row{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
.sub{opacity:.75;font-size:12px;margin-top:3px}
.plain{white-space:pre-wrap;word-break:break-word;margin-top:6px;padding:8px 10px;background:#0d1020;border-radius:8px;color:#fff;font-size:14px}
button{all:unset;cursor:pointer;background:#4f46e5;color:#fff;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600}
button:hover{background:#6366f1}
.brand{opacity:.55;font-size:11px;margin-left:auto}
`;

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export type CardUi = {
  model: CardModel;
  dec?: DecState;
  now?: number;
  onVerify?: () => void;
};

/** Builds one card (pure DOM, no site CSS dependency). Returns null for unknown seals. */
export function buildCard(doc: Document, sealId: string, ui: CardUi): HTMLElement | null {
  const m = ui.model;
  if (m.kind === "missing") return null;
  const now = ui.now ?? nowSec();
  const card = el(doc, "div", "card");
  card.setAttribute("data-seal", sealId);
  card.setAttribute("data-kind", m.kind);
  const row = el(doc, "div", "row");
  card.append(row);
  const brand = el(doc, "span", "brand", "Silent Seal");

  switch (m.kind) {
    case "sealed": {
      const line = el(doc, "span", undefined, "🔒 " + sealedLine(m, now));
      if (m.deadline !== null) {
        line.setAttribute("data-deadline", String(m.deadline));
        line.setAttribute("data-rule", m.rule ?? "TIMER");
      }
      row.append(line, el(doc, "span", undefined, "· ✅ sealed by a verified human"), brand);
      if (m.gated.length) card.append(el(doc, "div", "sub", `🌍 Visible to verified readers from ${m.gated.map(label).join(", ")}`));
      break;
    }
    case "cancelled":
      card.classList.add("cancelled");
      row.append(el(doc, "span", undefined, "🚫 Cancelled by author — this will never open"), brand);
      break;
    case "releasing":
      card.classList.add("releasing");
      row.append(el(doc, "span", undefined, "⏳ Rule fired — releasing via Chainlink CRE…"), brand);
      if (m.gated.length) card.append(el(doc, "div", "sub", `🌍 Visible to verified readers from ${m.gated.map(label).join(", ")}`));
      break;
    case "open-public":
      card.classList.add("open");
      appendOpened(doc, card, row, brand, ui.dec);
      break;
    case "open-gated": {
      card.classList.add(ui.dec?.status === "ok" ? "open" : "gated");
      if (m.reader === "none") {
        row.append(el(doc, "span", undefined, `🌍 Visible to verified readers from ${m.countries.map(label).join(", ")}`));
        const b = el(doc, "button", undefined, "Verify nationality");
        b.addEventListener("click", () => ui.onVerify?.());
        row.append(b, brand);
      } else if (ui.dec?.status === "denied") {
        row.append(el(doc, "span", undefined, `🚫 Not available in your country${m.nationality ? ` (${label(m.nationality)})` : ""}`), brand);
        card.append(el(doc, "div", "sub", `Only readers from ${m.countries.map(label).join(", ")} can open this.`));
      } else {
        appendOpened(doc, card, row, brand, ui.dec);
      }
      break;
    }
  }
  return card;
}

function appendOpened(doc: Document, card: HTMLElement, row: HTMLElement, brand: HTMLElement, dec?: DecState) {
  if (!dec || dec.status === "loading") {
    row.append(el(doc, "span", undefined, "🔓 Opened — decrypting…"), brand);
  } else if (dec.status === "ok") {
    row.append(el(doc, "span", undefined, "🔓 Opened by the seal"), brand);
    card.append(el(doc, "div", "plain", dec.text));
  } else if (dec.status === "file") {
    row.append(el(doc, "span", undefined, `🔓 Opened — file “${dec.name}” (${dec.size} bytes). Open the seal page to download.`), brand);
  } else if (dec.status === "error") {
    row.append(el(doc, "span", undefined, "🔓 Opened, but could not decrypt here"), brand);
    card.append(el(doc, "div", "sub", dec.msg));
  } else {
    row.append(el(doc, "span", undefined, "🚫 Not available in your country"), brand);
  }
}
