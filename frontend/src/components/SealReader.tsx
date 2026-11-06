"use client";
import type { SealState } from "@iigs/core";
import { Ban, Hourglass, Radio, SearchX, ShieldCheck, Globe2, Share2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getConfig } from "@/lib/client/config";
import { useNowSec } from "@/lib/client/hooks";
import { addRecentSeal, getLocalSeals, loadSealState } from "@/lib/client/seals";
import { audienceText, deadlineLabel, effectiveStatus, ruleText } from "@/lib/rules";
import type { PublicConfig } from "@/lib/types";
import { CopyButton } from "./CopyButton";
import { Countdown } from "./Countdown";
import { ProofLinks } from "./ProofLinks";
import { ReleasedView } from "./ReleasedView";
import { SealActions } from "./SealActions";
import { SharePanel } from "./SharePanel";
import { StatusChip } from "./StatusChip";
import { Badge } from "./ui/Badge";
import { buttonStyles } from "./ui/Button";
import { Card } from "./ui/Card";

type Loaded = { state: SealState | null; via: "arkiv" | "api" };

export function SealReader({ id }: { id: string }) {
  const params = useSearchParams();
  const justArmed = params.get("new") === "1";
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [mine, setMine] = useState(false);
  const [reloads, setReloads] = useState(0);
  const reload = () => setReloads((n) => n + 1);
  const now = useNowSec(1000);
  const final = loaded?.state?.status === "DISARMED" || loaded?.state?.status === "RELEASED";

  useEffect(() => {
    setMine(getLocalSeals().includes(id));
    getConfig().then(setCfg).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (final) return;
    let stop = false;
    const run = async () => {
      try {
        const l = await loadSealState(id);
        if (!stop) {
          setLoaded(l);
          setError(null);
          if (l.state) addRecentSeal(id);
        }
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : String(e));
      }
    };
    run();
    const t = setInterval(run, 10_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id, final, reloads]);

  if (loaded === undefined) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="flex items-center gap-3">
          {error ? null : <span className="size-2 animate-pulse rounded-full bg-sealed" aria-hidden />}
          <p className={error ? "text-danger" : "text-muted"} role="status">
            {error ? `Could not reach Arkiv: ${error}` : "Reading the seal from Arkiv…"}
          </p>
        </Card>
      </div>
    );
  }
  if (loaded.state === null) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="space-y-3 py-12 text-center">
          <SearchX className="mx-auto size-8 text-faint" aria-hidden />
          <h1 className="font-serif text-3xl">Seal not found</h1>
          <p className="text-sm text-muted">
            There is no seal <span className="font-mono">{id}</span> on Arkiv. If it was just armed, it can take a few seconds to
            appear; this page keeps checking.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-3">
            <Link href="/open" className={buttonStyles({ size: "sm" })}>Open a different seal</Link>
            <Link href="/app" className={buttonStyles({ size: "sm", variant: "ghost" })}>Your seals</Link>
          </div>
        </Card>
      </div>
    );
  }

  const state = loaded.state;
  const status = effectiveStatus(state, now);
  const { seal } = state;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-4 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={status} />
          <Badge tone="neutral">
            <ShieldCheck className="size-3.5 text-released" aria-hidden />
            Armed by a verified human — World ID Selfie Check
          </Badge>
        </div>
        <h1 className="text-balance font-serif text-[44px] leading-[1.02] tracking-[-0.02em] sm:text-[56px]">{seal.title || "A sealed message"}</h1>
        <p className="font-mono text-xs text-faint">{seal.sealId}</p>
      </header>

      {justArmed && mine ? (
        <Card className="border-released/25 bg-released-soft/50">
          <p className="font-medium text-released">Armed. The switch is live.</p>
          <ol className="mt-3 space-y-2 text-sm text-ink-soft">
            <li className="flex gap-3">
              <span className="font-serif text-[17px] leading-5 text-released">1</span>
              <span>Share it: post the hidden text below on X or Reddit, or send the link. People knowing it&apos;s armed is what protects you.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-serif text-[17px] leading-5 text-released">2</span>
              <span>
                {seal.intervalSec > 0
                  ? "Check in before the countdown runs out: tap I'm OK here or on Your seals. Each check-in is one face scan."
                  : "Nothing else to do. It opens on its own unless you disarm it."}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-serif text-[17px] leading-5 text-released">3</span>
              <span>Keep this browser. It is how this site knows the seal is yours.</span>
            </li>
          </ol>
          <Link href="/app" className={buttonStyles({ size: "sm", className: "mt-4" })}>Go to your seals</Link>
        </Card>
      ) : null}

      {status === "ARMED" ? (
        <Card className="relative space-y-4 overflow-hidden py-10 text-center">
          <p className="relative font-serif text-[17px] italic text-muted">{deadlineLabel(state.nextDeadlineRule)}</p>
          {state.nextDeadline ? <Countdown to={state.nextDeadline} big className="relative block text-sealed" /> : null}
          <p className="mx-auto max-w-md text-muted first-letter:uppercase">{ruleText(seal)}</p>
          {seal.intervalSec > 0 ? (
            <p className="mx-auto max-w-md text-sm text-muted">
              The author renews this with a face scan. If they go silent, Arkiv lets the heartbeat expire and the seal opens.
            </p>
          ) : null}
          {seal.audience === "GATED" ? (
            <p className="flex items-center justify-center gap-2 text-sm text-ink-soft">
              <Globe2 className="size-4" aria-hidden /> {audienceText(seal)}
            </p>
          ) : null}
          {mine ? (
            <div className="flex justify-center border-t border-line pt-5 [&>div]:justify-center">
              <SealActions state={state} onChanged={reload} />
            </div>
          ) : null}
        </Card>
      ) : null}
      {status === "RELEASING" && mine ? (
        <div className="flex justify-end">
          <SealActions state={state} onChanged={reload} />
        </div>
      ) : null}

      {status === "RELEASING" ? (
        <Card className="space-y-2 py-10 text-center">
          <Hourglass className="mx-auto size-7 animate-pulse text-sealed" aria-hidden />
          <p className="font-serif text-2xl">The rule fired</p>
          <p className="text-sm text-muted">Waiting for the Chainlink CRE release on Sepolia. This page opens it automatically.</p>
        </Card>
      ) : null}

      {status === "DISARMED" ? (
        <Card className="space-y-2 py-10 text-center">
          <Ban className="mx-auto size-7 text-faint" aria-hidden />
          <p className="font-serif text-2xl">Cancelled by the author.</p>
          <p className="text-sm text-muted">This will never open.</p>
        </Card>
      ) : null}

      {status === "RELEASED" ? <ReleasedView state={state} /> : null}

      {mine && cfg ? <SharePanel seal={seal} baseUrl={cfg.baseUrl} showPost={seal.contentType === "inline" || seal.source === "extension"} /> : null}

      {!mine && status === "ARMED" ? (
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Share2 className="size-5 shrink-0 text-muted" aria-hidden />
          <p className="flex-1 text-sm text-ink-soft">
            Pass this page on. The more people know this switch is armed, the less anyone gains by silencing its author. It opens
            here on its own; there&apos;s no need to refresh.
          </p>
          <CopyButton text={`${cfg?.baseUrl ?? window.location.origin}/s/${seal.sealId}`} label="Copy link" />
        </Card>
      ) : null}

      <section aria-labelledby="proof" className="space-y-3 pt-4">
        <h2 id="proof" className="flex items-center gap-2 font-serif text-[22px] text-fg">
          <Radio className="size-4 text-muted" aria-hidden /> Proof
        </h2>
        <ProofLinks state={state} swarmGateway={cfg?.swarmGateway} sepoliaExplorer={cfg?.sepoliaExplorer} />
        <p className="text-xs text-faint">
          {loaded.via === "arkiv"
            ? "This page read the seal directly from Arkiv in your browser."
            : "Arkiv could not be reached from your browser; this page used the server as a relay."}{" "}
          Nobody, including the operators of this site, can delete it.
        </p>
      </section>
    </div>
  );
}
