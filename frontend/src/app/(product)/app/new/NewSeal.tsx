"use client";
import { createSeal, fromHex, MAX_FILE_BYTES, type SealDraft } from "@iigs/core";
import { Activity, AlertTriangle, ArrowLeft, Clock, FileUp, Globe, Globe2, KeyRound, Lock, Type, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArmPanel } from "@/components/ArmPanel";
import { CountryPicker } from "@/components/CountryPicker";
import { DurationPicker } from "@/components/DurationPicker";
import { Button } from "@/components/ui/Button";
import { Card, StepTitle } from "@/components/ui/Card";
import { errorMessage } from "@/lib/client/api";
import { getConfig } from "@/lib/client/config";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

type Kind = "TIMER" | "HEARTBEAT" | "BOTH";
const KINDS: { id: Kind; icon: LucideIcon; title: string; blurb: string }[] = [
  { id: "TIMER", icon: Clock, title: "Timer", blurb: "Opens at a set time, unless you cancel it first." },
  { id: "HEARTBEAT", icon: Activity, title: "Dead-man", blurb: "Opens if you stop checking in with a face scan." },
  { id: "BOTH", icon: Lock, title: "Timer + dead-man", blurb: "Opens at the time, or earlier if you go silent." },
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
      <div className="mx-auto max-w-2xl space-y-8">
        <header>
          <p className="text-sm text-muted">Step 2 of 2</p>
          <h1 className="mt-2 font-serif text-[44px] leading-none tracking-[-0.02em] sm:text-[56px]">Ready to arm</h1>
          <p className="mt-4 text-[17px] text-ink-soft">Everything below was encrypted in this browser. The key never left your device unwrapped.</p>
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
        <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
          <ArrowLeft className="size-4" aria-hidden /> Edit the seal
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="pb-2">
        <p className="text-sm text-muted">Step 1 of 2</p>
        <h1 className="mt-2 font-serif text-[44px] leading-none tracking-[-0.02em] sm:text-[56px]">Seal something</h1>
        <p className="mt-4 text-[17px] text-ink-soft">Evidence, a document, or a post. It opens on your terms, or when you can no longer stop it.</p>
      </header>

      <Card className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StepTitle n="01" title="What to seal" />
          <div role="tablist" aria-label="Content type" className="inline-flex rounded-lg border border-line bg-surface-2 p-[3px]">
            {(["text", "file"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors",
                  mode === m ? "bg-field text-fg shadow-[0_1px_2px_rgb(60_45_25/0.12)]" : "text-muted hover:text-fg",
                )}
              >
                {m === "text" ? <Type className="size-3.5" /> : <FileUp className="size-3.5" />}
                {m === "text" ? "Write text" : "Upload a file"}
              </button>
            ))}
          </div>
        </div>

        {mode === "text" ? (
          <label className="block">
            <span className="sr-only">Message to seal</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder="What do you want sealed?"
              className="w-full resize-y rounded-xl border border-line bg-field p-4 font-serif text-[18px] leading-relaxed transition-colors placeholder:text-faint"
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
              "rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-fg bg-field" : "border-line-strong bg-field/60",
            )}
          >
            <span className="mx-auto grid size-11 place-items-center rounded-lg border border-line bg-surface">
              <FileUp className="size-5 text-muted" aria-hidden />
            </span>
            {file ? (
              <p className="mt-4 text-sm">
                <span className="font-medium">{file.name}</span> <span className="text-muted">· {formatBytes(file.size)}</span>
              </p>
            ) : (
              <p className="mt-4 text-sm text-muted">Drag and drop a file here (up to 10 MB), or</p>
            )}
            <input ref={fileInput} type="file" className="sr-only" id="file" onChange={(e) => pickFile(e.target.files?.[0])} />
            <Button size="sm" className="mt-4" onClick={() => fileInput.current?.click()}>
              {file ? "Choose another file" : "Choose a file"}
            </Button>
          </div>
        )}

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink-soft">Public title (optional)</span>
          <input
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Shown on the seal page before it opens"
            className="h-11 w-full rounded-lg border border-line bg-field px-3.5 text-[15px] placeholder:text-faint"
          />
          <span className="mt-2 flex items-center gap-1.5 text-[13px] text-sealed">
            <AlertTriangle className="size-3.5" aria-hidden /> The title is stored in plaintext on Arkiv. Do not put anything secret in it.
          </span>
        </label>
      </Card>

      <Card className="space-y-6">
        <fieldset>
          <legend className="mb-4 w-full">
            <StepTitle n="02" title="When does it open?" />
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {KINDS.map((k) => (
              <Choice key={k.id} name="kind" on={kind === k.id} onSelect={() => setKind(k.id)} icon={k.icon} title={k.title} blurb={k.blurb} />
            ))}
          </div>
        </fieldset>
        {kind !== "HEARTBEAT" ? <DurationPicker legend="Opens in" value={timerSec} onChange={setTimerSec} min={60} /> : null}
        {kind !== "TIMER" ? (
          <DurationPicker legend="Opens if I am silent for" value={hbSec} onChange={setHbSec} min={60} />
        ) : null}
      </Card>

      <Card className="space-y-6">
        <fieldset>
          <legend className="mb-4 w-full">
            <StepTitle n="03" title="Who can read it once it opens?" />
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["PUBLIC", Globe, "Everyone", "Anyone with the link or the extension."],
                ["GATED", Globe2, "Verified readers from chosen countries", "Readers prove their nationality with World ID."],
              ] as const
            ).map(([id, icon, t, b]) => (
              <Choice key={id} name="aud" on={audience === id} onSelect={() => setAudience(id)} icon={icon} title={t} blurb={b} />
            ))}
          </div>
        </fieldset>
        {audience === "GATED" ? <CountryPicker value={countries} onChange={setCountries} /> : null}
      </Card>

      <div className="flex flex-col items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <KeyRound className="size-3.5" aria-hidden />
          {!contentReady ? "Add some text or a file first." : "Encrypted on this device with XChaCha20-Poly1305."}
        </p>
        <Button variant="primary" size="lg" disabled={!contentReady || !gatedReady || busy !== null} onClick={prepare}>
          <Lock className="size-4" aria-hidden />
          {busy ?? "Encrypt and continue"}
        </Button>
      </div>
    </div>
  );
}

function Choice({
  name,
  on,
  onSelect,
  icon: Icon,
  title,
  blurb,
}: {
  name: string;
  on: boolean;
  onSelect: () => void;
  icon: LucideIcon;
  title: string;
  blurb: string;
}) {
  return (
    <label
      className={cn(
        "group relative cursor-pointer rounded-xl border p-4 text-sm transition-all",
        on ? "border-fg bg-field shadow-[0_0_0_1px_var(--ink)]" : "border-line bg-field/50 hover:border-line-strong hover:bg-field",
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={on} onChange={onSelect} />
      <span className="flex items-center justify-between">
        <Icon className={cn("size-4", on ? "text-fg" : "text-muted")} aria-hidden />
        <span className={cn("grid size-4 place-items-center rounded-full border", on ? "border-fg bg-fg" : "border-line-strong bg-field")} aria-hidden>
          {on ? <span className="size-1.5 rounded-full bg-field" /> : null}
        </span>
      </span>
      <span className="mt-3 block font-medium text-fg">{title}</span>
      <span className="mt-1 block leading-relaxed text-muted">{blurb}</span>
    </label>
  );
}
