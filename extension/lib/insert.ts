export type InsertResult = { inserted: boolean; method: "execCommand" | "value" | "clipboard" | "none" };

const EDITABLE = '[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"],textarea,input[type="text"],[role="textbox"]';
const FALLBACKS = [
  '[data-testid="tweetTextarea_0"]',
  'shreddit-composer [contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"]',
  "textarea",
];

export function closestEditable(t: EventTarget | null): HTMLElement | null {
  if (!(t instanceof Element)) return null;
  const e = t.closest(EDITABLE);
  return e instanceof HTMLElement ? e : null;
}

export function findEditable(doc: Document, last: HTMLElement | null): HTMLElement | null {
  if (last && last.isConnected) return last;
  for (const sel of FALLBACKS) {
    const e = doc.querySelector(sel);
    if (e instanceof HTMLElement) return e;
  }
  return null;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
function contains(el: HTMLElement, text: string): boolean {
  const cur = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : el.textContent ?? "";
  return norm(cur).includes(norm(text).slice(-24));
}

export function insertIntoEditable(doc: Document, el: HTMLElement, text: string): InsertResult {
  el.focus();
  const isField = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
  if (isField) {
    el.setSelectionRange(el.value.length, el.value.length);
  } else {
    const sel = doc.defaultView?.getSelection();
    if (sel) {
      const range = doc.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  let ok = false;
  try {
    ok = doc.execCommand("insertText", false, text);
  } catch {
    ok = false;
  }
  if (ok && contains(el, text)) return { inserted: true, method: "execCommand" };
  if (isField) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    const next = (el.value ? el.value + " " : "") + text;
    if (setter) setter.call(el, next);
    else el.value = next;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    if (contains(el, text)) return { inserted: true, method: "value" };
  }
  return { inserted: false, method: "none" };
}

export async function copyToClipboard(doc: Document, text: string): Promise<boolean> {
  try {
    await doc.defaultView!.navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the legacy path */
  }
  const ta = doc.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
  doc.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = doc.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function toast(doc: Document, message: string) {
  const host = doc.createElement("div");
  host.setAttribute("data-iigs-card", "toast");
  const root = host.attachShadow({ mode: "open" });
  const box = doc.createElement("div");
  box.textContent = message;
  box.style.cssText =
    "position:fixed;z-index:2147483647;right:16px;bottom:16px;background:#161a2e;color:#fff;border:1px solid #6366f1;border-radius:10px;padding:10px 14px;font:13px -apple-system,Segoe UI,sans-serif;box-shadow:0 6px 24px #0008";
  root.append(box);
  doc.body.append(host);
  setTimeout(() => host.remove(), 5000);
}
