"use client";
import { Globe2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ReaderVerify } from "@/components/ReaderVerify";
import { Card } from "@/components/ui/Card";
import { getReaderSession, type ReaderSession } from "@/lib/client/seals";
import { flag } from "@/lib/format";

export function VerifyReader() {
  const [session, setSession] = useState<ReaderSession | null>(null);
  useEffect(() => setSession(getReaderSession()), []);

  function done(s: ReaderSession) {
    setSession(s);
    toast.success(`Verified: ${s.nationality}`);
    window.postMessage(
      { source: "iigs-web", type: "IIGS_READER_TOKEN", token: s.token, nationality: s.nationality, expiresAt: s.expiresAt },
      location.origin,
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="font-serif text-[44px] leading-none tracking-[-0.02em] sm:text-[56px]">Verify as a reader</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">
          Some sealed messages open only for readers of chosen countries. Prove your nationality once with a World ID passport check;
          this browser (and the Silent Seal extension) remembers it for 12 hours.
        </p>
      </header>
      <Card className="space-y-4">
        {session ? (
          <p className="flex items-center gap-2 text-released" role="status">
            <Globe2 className="size-5" aria-hidden /> Verified as {flag(session.nationality)} {session.nationality}. You can close this tab.
          </p>
        ) : null}
        <ReaderVerify onSession={done} label={session ? "Verify again" : "Verify nationality with World ID"} />
        <p className="text-xs text-faint">We learn your nationality and nothing else: no name, no birthdate, no document number.</p>
      </Card>
    </div>
  );
}
