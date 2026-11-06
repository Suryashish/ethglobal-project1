"use client";
import { fromBase64, openSeal, type Envelope, type SealState } from "@iigs/core";
import { Download, FileText, Globe2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiClientError, apiPost } from "@/lib/client/api";
import { fetchCiphertext, getReaderSession, type ReaderSession } from "@/lib/client/seals";
import { flag, formatBytes } from "@/lib/format";
import { ReaderVerify } from "./ReaderVerify";
import { Card, Label } from "./ui/Card";

type Phase =
  | { t: "working"; msg: string }
  | { t: "needs_verify" }
  | { t: "denied"; nationality: string }
  | { t: "error"; msg: string }
  | { t: "open"; env: Envelope };

// Raster images only. SVG is NOT previewed: an author-supplied SVG can carry <script>, and a blob: URL opened in a
// new tab runs with this site's origin. Everything that is not previewable is served as application/octet-stream.
const PREVIEW_IMG = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/;

/** Decrypts a released seal in the browser (PUBLIC: key from Arkiv; GATED: key from the key service). */
export function ReleasedView({ state }: { state: SealState }) {
  const { seal, release } = state;
  const gated = seal.audience === "GATED" || release?.gated === true;
  const [phase, setPhase] = useState<Phase>({ t: "working", msg: "Fetching the ciphertext…" });

  const decrypt = useCallback(
    async (key: Uint8Array) => {
      setPhase({ t: "working", msg: "Decrypting in your browser…" });
      const ciphertext = seal.cipherInline ?? (seal.swarmRef ? await fetchCiphertext(seal.swarmRef) : null);
      if (!ciphertext) throw new Error("The ciphertext is missing from the seal.");
      const env = openSeal({ sealId: seal.sealId, key, ciphertext, contentHash: seal.contentHash });
      setPhase({ t: "open", env });
    },
    [seal],
  );

  const requestKey = useCallback(
    async (session: ReaderSession) => {
      setPhase({ t: "working", msg: "Asking the key service…" });
      try {
        const r = await apiPost<{ keyB64: string }>("/api/reader/key", { sealId: seal.sealId, token: session.token });
        await decrypt(fromBase64(r.keyB64));
      } catch (e) {
        if (e instanceof ApiClientError && e.code === "not_in_country") setPhase({ t: "denied", nationality: session.nationality });
        else if (e instanceof ApiClientError && (e.code === "bad_token" || e.code === "token_expired")) setPhase({ t: "needs_verify" });
        else setPhase({ t: "error", msg: e instanceof Error ? e.message : String(e) });
      }
    },
    [seal.sealId, decrypt],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!gated) {
          if (!release?.releasedKey) throw new Error("The release record has no key. The mirror may still be publishing it.");
          await decrypt(release.releasedKey);
        } else {
          const s = getReaderSession();
          if (s) await requestKey(s);
          else if (!cancelled) setPhase({ t: "needs_verify" });
        }
      } catch (e) {
        if (!cancelled) setPhase({ t: "error", msg: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gated, release, decrypt, requestKey]);

  const countries = seal.countries.map((c) => `${flag(c)} ${c}`).join(", ");

  if (phase.t === "working") {
    return (
      <Card>
        <p className="text-muted" role="status">{phase.msg}</p>
      </Card>
    );
  }
  if (phase.t === "error") {
    return (
      <Card className="border-danger/30">
        <p className="font-medium text-danger">Could not open this seal</p>
        <p className="mt-1 text-sm text-muted">{phase.msg}</p>
      </Card>
    );
  }
  if (phase.t === "needs_verify") {
    return (
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <Globe2 className="size-6 text-muted" aria-hidden />
          <p className="text-lg font-medium">Visible to verified readers from {countries}</p>
        </div>
        <p className="text-sm text-muted">
          The author restricted this to readers of certain nationalities. Prove yours with a World ID passport check. Only your
          nationality is checked; nothing else is revealed.
        </p>
        <ReaderVerify countries={seal.countries} onSession={(s) => requestKey(s)} />
      </Card>
    );
  }
  if (phase.t === "denied") {
    return (
      <Card className="border-danger/30">
        <p className="text-lg font-medium text-danger">Not available in your country</p>
        <p className="mt-1 text-sm text-muted">
          You verified as {flag(phase.nationality)} {phase.nationality}. This seal is visible to readers from {countries}.
        </p>
      </Card>
    );
  }
  return <Opened env={phase.env} />;
}

function Opened({ env }: { env: Envelope }) {
  const [url, setUrl] = useState<string | null>(null);
  const h = env.header;
  const mime = h.kind === "file" ? h.mime.toLowerCase() : "";
  const previewable = PREVIEW_IMG.test(mime) || mime === "application/pdf";
  useEffect(() => {
    if (h.kind !== "file") return;
    const blob = new Blob([env.body.slice().buffer as ArrayBuffer], { type: previewable ? mime : "application/octet-stream" });
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [env, h.kind, mime, previewable]);

  if (h.kind === "text") {
    return (
      <Card className="border-released/30">
        <Label className="text-released">Decrypted in your browser</Label>
        <p className="mt-4 whitespace-pre-wrap break-words font-serif text-2xl leading-snug">{new TextDecoder().decode(env.body)}</p>
      </Card>
    );
  }
  return (
    <Card className="space-y-4 border-released/30">
      <Label className="text-released">Decrypted in your browser</Label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2">
          <FileText className="size-5 text-muted" aria-hidden />
          <span className="font-medium">{h.name}</span>
          <span className="text-sm text-muted">{formatBytes(h.size)} · {h.mime}</span>
        </p>
        {url ? (
          <a
            href={url}
            download={h.name}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-released px-4 text-sm font-medium text-white transition hover:brightness-110"
          >
            <Download className="size-4" aria-hidden /> Download
          </a>
        ) : null}
      </div>
      {url && PREVIEW_IMG.test(mime) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={h.name} className="max-h-[70vh] w-full rounded-xl border border-line bg-bg object-contain" />
      ) : null}
      {url && mime === "application/pdf" ? (
        <object data={url} type="application/pdf" className="h-[70vh] w-full rounded-xl border border-line" aria-label={h.name}>
          <p className="p-4 text-sm text-muted">Your browser cannot preview PDFs. Use the download button.</p>
        </object>
      ) : null}
      {!previewable ? <p className="text-sm text-muted">No preview for this file type. Download it to open it.</p> : null}
    </Card>
  );
}
