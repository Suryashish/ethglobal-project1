"use client";
import { createSeal, fromHex, MAX_FILE_BYTES, type SealDraft } from "@iigs/core";
import { AlertTriangle, FileUp, Lock, Type } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArmPanel } from "@/components/ArmPanel";
import { CountryPicker } from "@/components/CountryPicker";
import { DurationPicker } from "@/components/DurationPicker";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { errorMessage } from "@/lib/client/api";
import { getConfig } from "@/lib/client/config";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

type Kind = "TIMER" | "HEARTBEAT" | "BOTH";
const KINDS: { id: Kind; title: string; blurb: string }[] = [
  { id: "TIMER", title: "Timer", blurb: "Opens at a set time, unless you cancel it first." },
  { id: "HEARTBEAT", title: "Dead-man", blurb: "Opens if you stop checking in with a face scan." },
  { id: "BOTH", title: "Timer + dead-man", blurb: "Opens at the time, or earlier if you go silent." },
];

export function NewSeal() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("HEARTBEAT");
  const [timerSec, setTimerSec] = useState(300);
  const [hbSec, setHbSec] = useState(120);
  const [audience, setAudience] = useState<"PUBLIC" | "GATED">("PUBLIC");
  const [countries, setCountries] = useState<string[]>(["IN"]);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<SealDraft | null>(null);

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast.error(`That file is ${formatBytes(f.size)}. The maximum is 10 MB.`);
      return;
    }
    setFile(f);
  }

  const contentReady = mode === "text" ? text.trim().length > 0 : file !== null;
  const gatedReady = audience === "PUBLIC" || countries.length > 0;

  async function prepare() {
    setBusy("Encrypting on this device…");
    try {
      const cfg = await getConfig();
      const content =
        mode === "text"
          ? ({ type: "text", text } as const)
          : ({
              type: "file",
              name: file!.name,
              mime: file!.type || "application/octet-stream",
              bytes: new Uint8Array(await file!.arrayBuffer()),
            } as const);
      const now = Math.floor(Date.now() / 1000);
      const rule =
        kind === "TIMER"
          ? ({ kind, releaseAt: now + timerSec } as const)
          : kind === "HEARTBEAT"
            ? ({ kind, intervalSec: hbSec } as const)
            : ({ kind, releaseAt: now + timerSec, intervalSec: hbSec } as const);
      const out = createSeal({
        content,
        rule,
        audience,
        countries,
        title,
        escrowPublicKey: fromHex(cfg.escrowPublicKey),
        gatedPublicKey: fromHex(cfg.gatedPublicKey),
        source: "vault",
      });
      let d = out.draft;
      if (out.needsSwarmUpload) {
        setBusy("Uploading ciphertext to Swarm…");
        const res = await fetch("/api/swarm/upload", {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: out.ciphertext as unknown as BodyInit,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.message ?? `Swarm upload failed (${res.status})`);
        d = { ...d, swarmRef: j.reference as string };
      }
      setDraft(d);
    } catch (e) {
      toast.error("Could not prepare the seal", { description: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  if (draft) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="font-serif text-3xl">Ready to arm</h1>
          <p className="mt-2 text-muted">Everything below was encrypted in this browser. The key never left your device unwrapped.</p>
        </header>
        <Card>
          <ArmPanel
            draft={draft}
            onArmed={(r) => {
              toast.success("Armed. The switch is live.");
              router.push(`/s/${r.sealId}?new=1`);
            }}
          />
        </Card>
        <Button variant="ghost" onClick={() => setDraft(null)}>
          ← Edit the seal
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="font-serif text-3xl sm:text-4xl">Seal something</h1>
        <p className="mt-2 text-muted">Evidence, a document, or a post. It opens on your terms, or when you can no longer stop it.</p>
      </header>

      <Card className="space-y-5">
        <div role="tablist" aria-label="Content type" className="inline-flex rounded-lg border border-line bg-bg p-1">
          {(["text", "file"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm cursor-pointer",
                mode === m ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
              )}
            >
              {m === "text" ? <Type className="size-4" /> : <FileUp className="size-4" />}
              {m === "text" ? "Write text" : "Upload a file"}
            </button>
          ))}
        </div>

        {mode === "text" ? (
          <label className="block">
            <span className="sr-only">Message to seal</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder="What do you want sealed?"
              className="w-full rounded-lg border border-line bg-bg p-4 text-base leading-relaxed placeholder:text-muted/60"
            />
          </label>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files[0]);
            }}
            className={cn(
              "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              dragging ? "border-sealed bg-sealed/5" : "border-line",
            )}
          >
            <FileUp className="mx-auto size-8 text-muted" aria-hidden />
            {file ? (
              <p className="mt-3 text-sm">
                <span className="font-medium">{file.name}</span> <span className="text-muted">· {formatBytes(file.size)}</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">Drag and drop a file here (up to 10 MB), or</p>
            )}
            <input ref={fileInput} type="file" className="sr-only" id="file" onChange={(e) => pickFile(e.target.files?.[0])} />
            <Button className="mt-3" onClick={() => fileInput.current?.click()}>
              {file ? "Choose another file" : "Choose a file"}
            </Button>
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Public title (optional)</span>
          <input
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 w-full rounded-md border border-line bg-bg px-3 text-sm"
          />
          <span className="mt-1.5 flex items-center gap-1.5 text-xs text-sealed">
            <AlertTriangle className="size-3.5" aria-hidden /> The title is stored in plaintext on Arkiv. Do not put anything secret in it.
          </span>
        </label>
      </Card>

      <Card className="space-y-6">
        <fieldset>
          <legend className="mb-3 text-sm font-medium">When does it open?</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {KINDS.map((k) => (
              <label
                key={k.id}
                className={cn(
                  "cursor-pointer rounded-lg border p-4 text-sm transition-colors",
                  kind === k.id ? "border-sealed bg-sealed/10" : "border-line hover:border-[#3a3a42]",
                )}
              >
                <input type="radio" name="kind" className="sr-only" checked={kind === k.id} onChange={() => setKind(k.id)} />
                <span className="block font-medium">{k.title}</span>
                <span className="mt-1 block text-muted">{k.blurb}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {kind !== "HEARTBEAT" ? <DurationPicker legend="Opens in" value={timerSec} onChange={setTimerSec} min={60} /> : null}
        {kind !== "TIMER" ? (
          <DurationPicker legend="Opens if I am silent for" value={hbSec} onChange={setHbSec} min={60} />
        ) : null}
      </Card>

      <Card className="space-y-5">
        <fieldset>
          <legend className="mb-3 text-sm font-medium">Who can read it once it opens?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["PUBLIC", "Everyone", "Anyone with the link or the extension."],
                ["GATED", "Verified readers from chosen countries", "Readers prove their nationality with World ID."],
              ] as const
            ).map(([id, t, b]) => (
              <label
                key={id}
                className={cn(
                  "cursor-pointer rounded-lg border p-4 text-sm transition-colors",
                  audience === id ? "border-sealed bg-sealed/10" : "border-line hover:border-[#3a3a42]",
                )}
              >
                <input type="radio" name="aud" className="sr-only" checked={audience === id} onChange={() => setAudience(id)} />
                <span className="block font-medium">{t}</span>
                <span className="mt-1 block text-muted">{b}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {audience === "GATED" ? <CountryPicker value={countries} onChange={setCountries} /> : null}
      </Card>

      <div className="flex flex-col items-start gap-3">
        <Button variant="primary" size="lg" disabled={!contentReady || !gatedReady || busy !== null} onClick={prepare}>
          <Lock className="size-4" aria-hidden />
          {busy ?? "Encrypt and continue"}
        </Button>
        {!contentReady ? <p className="text-xs text-muted">Add some text or a file first.</p> : null}
      </div>
    </div>
  );
}
