// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorldProofEnvelope } from "../src/types.js";

// Stand-in for the IDKit widget: records the props it was opened with and submits like the real one (envelope uses p.signal).
type WidgetProps = { signal: string; kind: "owner" | "reader"; onResult: (e: WorldProofEnvelope) => Promise<void> };
const opened: WidgetProps[] = [];
vi.mock("../src/live.js", () => ({
  default: (p: WidgetProps) => { opened.push(p); return null; },
  friendlyIdkitError: (c: string) => c,
}));

const { WorldVerifyButton } = await import("../src/client.js");
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { opened.length = 0; vi.unstubAllGlobals(); document.body.innerHTML = ""; });

describe("WorldVerifyButton live flow", () => {
  it("keeps the signal it started with when the caller refreshes issuedAt mid-flow", async () => {
    const rpBodies: { signal: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      rpBodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ rp_id: "rp_x", nonce: "0x1", created_at: 1, expires_at: 2, signature: "0x" }), { status: 200 });
    }));
    const submitted: WorldProofEnvelope[] = [];
    const A = "iigs|arm|aaaaaaaaaaaaaaaa|d|1000";
    const B = "iigs|arm|aaaaaaaaaaaaaaaa|d|1060"; // the 60 s issuedAt tick fired while the user was on their phone
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    const ui = (signal: string) => (
      <WorldVerifyButton kind="owner" signal={signal} label="Arm" config={{ mode: "live", appId: "app_x" }} onVerified={(e) => { submitted.push(e); }} />
    );

    await act(async () => root.render(ui(A)));
    await act(async () => el.querySelector("button")!.click());
    await vi.waitFor(() => expect(opened.length).toBeGreaterThan(0));
    await act(async () => root.render(ui(B)));

    const widget = opened.at(-1)!;
    expect(rpBodies[0]!.signal).toBe(A); // server nonce bound to A
    expect(widget.signal).toBe(A); // World request (signal_hash) built from A
    await act(async () => widget.onResult({ mode: "live", kind: "owner", signal: widget.signal, result: {} }));
    expect(submitted[0]!.signal).toBe(A); // and the proof is submitted as A, not B
    await act(async () => root.unmount());
  });
});
