import { label } from "./countries";
import { sealedLine, type CardModel } from "./card";
import { nowSec } from "./format";

export type DecState =
  | { status: "loading" }
  | { status: "ok"; text: string }
  | { status: "file"; name: string; size: number }
  | { status: "denied" }
  | { status: "error"; msg: string; retryAt: number };

// Paper, ink, sealing wax and leaf: mirrors the web app (frontend/src/app/globals.css). Reads like a note pinned
// under the post, on light and dark timelines alike. Site fonts can't be loaded in here, so the stacks fall back cleanly.
export const CARD_CSS = `
:host{all:initial;display:block;margin:10px 0}
*{box-sizing:border-box}
.card{font:13.5px/1.45 "IBM Plex Sans",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;color:#1d1b17;background:#fbf8f2;border:1px solid #e3dacb;border-radius:13px;padding:10px 12px;max-width:100%;box-shadow:0 1px 2px rgba(60,45,25,.08),0 8px 22px -14px rgba(40,30,15,.35)}
.row{display:flex;flex-wrap:wrap;gap:6px 9px;align-items:center}
.ic{display:grid;place-items:center;width:22px;height:22px;flex:none;border-radius:6px;background:#f4e2dc;color:#a8352b;border:1px solid rgba(168,53,43,.22)}
.ic svg{width:13px;height:13px}
.card.open .ic{background:#e0ece2;color:#2e6a48;border-color:rgba(46,106,72,.25)}
.card.cancelled .ic{background:#efe8db;color:#5f584e;border-color:#e3dacb}
.lead{font-weight:500}
.card.open .lead{color:#2e6a48}
.card.cancelled .lead{color:#5f584e}
.meta{color:#5f584e;font-size:12.5px}
.sub{color:#5f584e;font-size:12.5px;margin-top:5px;padding-left:31px}
.plain{white-space:pre-wrap;word-break:break-word;margin-top:9px;padding:10px 13px;background:#fffdf9;border:1px solid #e3dacb;border-radius:9px;color:#1d1b17;font:16px/1.5 "Newsreader",Georgia,"Times New Roman",serif}
button{all:unset;cursor:pointer;background:#1d1b17;color:#fbf8f2;padding:4px 11px;border-radius:7px;font-size:12.5px;font-weight:500}
button:hover{background:#3b3731}
button:focus-visible{outline:2px solid #1d1b17;outline-offset:2px}
.brand{display:inline-flex;align-items:center;gap:5px;color:#776e61;font-size:11.5px;margin-left:auto}
.brand svg{width:12px;height:12px;color:#a8352b}
`;

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS: Record<string, string> = {
  lock: "M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5z",
  open: "M7 11V8a5 5 0 0 1 9.6-2 M5 11h14v10H5z",
  ban: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M5.6 5.6l12.8 12.8",
  hourglass: "M6 3h12 M6 21h12 M7 3c0 5 10 5 10 9s-10 4-10 9 M17 3c0 5-10 5-10 9",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3.5 3 14.5 0 18 M12 3c-3 3.5-3 14.5 0 18",
  pulse: "M2.5 13h4.2l2.1-6 3.6 11 2.3-5h6.8",
};

function svgIcon(doc: Document, name: keyof typeof ICONS): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name]!);
  svg.append(path);
  return svg;
}

function icon(doc: Document, name: keyof typeof ICONS): HTMLElement {
  const s = el(doc, "span", "ic");
  s.append(svgIcon(doc, name));
  return s;
}

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
  const brand = el(doc, "span", "brand");
  brand.append(svgIcon(doc, "pulse"), doc.createTextNode("Silent Seal"));

  switch (m.kind) {
    case "sealed": {
      const line = el(doc, "span", "lead", sealedLine(m, now));
      if (m.deadline !== null) {
        line.setAttribute("data-deadline", String(m.deadline));
        line.setAttribute("data-rule", m.rule ?? "TIMER");
      }
      row.append(icon(doc, "lock"), line, brand);
      card.append(el(doc, "div", "sub", "Armed and sealed by a verified human"));
      if (m.gated.length) card.append(el(doc, "div", "sub", `Visible to verified readers from ${m.gated.map(label).join(", ")}`));
      break;
    }
    case "cancelled":
      card.classList.add("cancelled");
      row.append(icon(doc, "ban"), el(doc, "span", "lead", "Cancelled by author — this will never open"), brand);
      break;
    case "releasing":
      card.classList.add("releasing");
      row.append(icon(doc, "hourglass"), el(doc, "span", "lead", "Rule fired — releasing via Chainlink CRE…"), brand);
      if (m.gated.length) card.append(el(doc, "div", "sub", `Visible to verified readers from ${m.gated.map(label).join(", ")}`));
      break;
    case "open-public":
      card.classList.add("open");
      appendOpened(doc, card, row, brand, ui.dec);
      break;
    case "open-gated": {
      card.classList.add(ui.dec?.status === "ok" ? "open" : "gated");
      if (m.reader === "none") {
        row.append(icon(doc, "globe"), el(doc, "span", "lead", `Visible to verified readers from ${m.countries.map(label).join(", ")}`));
        const b = el(doc, "button", undefined, "Verify nationality");
        b.addEventListener("click", () => ui.onVerify?.());
        row.append(b, brand);
      } else if (ui.dec?.status === "denied") {
        // never print the reader's verified nationality into the page (the site's own scripts could read it)
        row.append(icon(doc, "ban"), el(doc, "span", "lead", "Not available in your country"), brand);
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
    row.append(icon(doc, "open"), el(doc, "span", "lead", "Opened — decrypting…"), brand);
  } else if (dec.status === "ok") {
    row.append(icon(doc, "open"), el(doc, "span", "lead", "Opened by the seal"), brand);
    card.append(el(doc, "div", "plain", dec.text));
  } else if (dec.status === "file") {
    row.append(icon(doc, "open"), el(doc, "span", "lead", `Opened — file “${dec.name}” (${dec.size} bytes). Open the seal page to download.`), brand);
  } else if (dec.status === "error") {
    row.append(icon(doc, "open"), el(doc, "span", "lead", "Opened, but could not decrypt here"), brand);
    card.append(el(doc, "div", "sub", dec.msg));
  } else {
    row.append(icon(doc, "ban"), el(doc, "span", "lead", "Not available in your country"), brand);
  }
}
