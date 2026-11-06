"use client";
import { ArrowRight, Globe2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getReaderSession, getRecentSeals, sealIdFromInput, type ReaderSession } from "@/lib/client/seals";
import { flag } from "@/lib/format";

/** For readers: paste a link, an id or a hidden post, and go straight to the seal. */
export function OpenSeal() {
  const router = useRouter();
  const inputId = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [reader, setReader] = useState<ReaderSession | null>(null);

  useEffect(() => {
    setRecent(getRecentSeals());
    setReader(getReaderSession());
  }, []);

  function open(raw = text) {
    const id = sealIdFromInput(raw);
    if (!id) {
      setError("No seal found in that text. Paste the whole post exactly as it appears, or the seal link.");
      return;
    }
    router.push(`/s/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="pb-2">
        <h1 className="font-serif text-[44px] leading-none tracking-[-0.02em] sm:text-[56px]">Open a seal</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">
          Got a seal link, or a post that reads a little oddly? Paste it here. If it hides a seal, we&apos;ll take you to it.
        </p>
      </header>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            open();
          }}
        >
          <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-ink-soft">
            Seal link, seal id, or the text of a hidden post
          </label>
          <textarea
            id={inputId}
            value={text}
            rows={3}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onPaste={(e) => {
              // opening straight away on paste saves a click; the button is still there if it doesn't parse
              const pasted = e.clipboardData.getData("text");
              if (sealIdFromInput(pasted)) {
                e.preventDefault();
                setText(pasted);
                open(pasted);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                open();
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-err` : undefined}
            placeholder="https://…/s/7297zmq67qld8zbb  ·  or  ·  Fiery farmers skip idly near the dusky ship…"
            className="w-full resize-none rounded-lg border border-line bg-field px-3.5 py-3 font-serif text-[17px] leading-relaxed placeholder:font-sans placeholder:text-sm placeholder:text-faint"
          />
          {error ? (
            <p id={`${inputId}-err`} role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-faint">Nothing you paste leaves this page.</p>
            <Button type="submit" variant="primary" disabled={!text.trim()}>
              Open <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </form>
      </Card>

      {recent.length ? (
        <section aria-labelledby="recent">
          <h2 id="recent" className="mb-3 font-serif text-[22px]">
            Seals you&apos;ve looked at
          </h2>
          <ul className="panel divide-y divide-line overflow-hidden rounded-xl">
            {recent.map((id) => (
              <li key={id}>
                <Link href={`/s/${id}`} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-field">
                  <span className="font-mono text-sm">{id}</span>
                  <ArrowRight className="size-4 text-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Globe2 className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <div>
            <h2 className="font-medium">Some seals open only for readers from certain countries</h2>
            <p className="mt-1 text-sm text-muted">
              {reader
                ? `You're verified as ${flag(reader.nationality)} ${reader.nationality} on this browser.`
                : "Prove your nationality once with World ID. Nothing else about you is shared."}
            </p>
          </div>
        </div>
        <Link href="/verify-reader" className={buttonStyles({ size: "md" })}>
          {reader ? "Verify again" : "Verify nationality"}
        </Link>
      </Card>
    </div>
  );
}
