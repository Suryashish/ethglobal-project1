"use client";
import type { SealState } from "@iigs/core";
import { Ban, Hourglass, Radio, SearchX, ShieldCheck, Globe2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getConfig } from "@/lib/client/config";
import { useNowSec } from "@/lib/client/hooks";
import { getLocalSeals, loadSealState } from "@/lib/client/seals";
import { audienceText, deadlineLabel, effectiveStatus, ruleText } from "@/lib/rules";
import type { PublicConfig } from "@/lib/types";
import { Countdown } from "./Countdown";
import { ProofLinks } from "./ProofLinks";
import { ReleasedView } from "./ReleasedView";
import { SharePanel } from "./SharePanel";
import { StatusChip } from "./StatusChip";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";

type Loaded = { state: SealState | null; via: "arkiv" | "api" };

export function SealReader({ id }: { id: string }) {
  const params = useSearchParams();
  const justArmed = params.get("new") === "1";
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [mine, setMine] = useState(false);
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
  }, [id, final]);

  if (loaded === undefined) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
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
        <Card className="space-y-3 text-center">
          <SearchX className="mx-auto size-8 text-muted" aria-hidden />
          <h1 className="text-xl font-semibold">Seal not found</h1>
          <p className="text-sm text-muted">
            There is no seal <span className="font-mono">{id}</span> on Arkiv. If it was just armed, it can take a few seconds to
            appear; this page keeps checking.
          </p>
        </Card>
      </div>
    );
  }

  const state = loaded.state;
  const status = effectiveStatus(state, now);
  const { seal } = state;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={status} />
          <Badge tone="neutral">
            <ShieldCheck className="size-3.5 text-released" aria-hidden />
            Armed by a verified human — World ID Selfie Check
          </Badge>
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl">{seal.title || "A sealed message"}</h1>
        <p className="font-mono text-xs text-muted">{seal.sealId}</p>
      </header>

      {justArmed && mine ? (
        <Card className="border-sealed/40 bg-sealed/5">
          <p className="font-medium text-sealed">Armed. The switch is live.</p>
          <p className="mt-1 text-sm text-muted">Post the hidden text below on X or Reddit, or share the link. Keep this device: it is how you find your seal in the Vault.</p>
        </Card>
      ) : null}

      {status === "ARMED" ? (
        <Card className="space-y-4 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{deadlineLabel(state.nextDeadlineRule)}</p>
          {state.nextDeadline ? <Countdown to={state.nextDeadline} big className="text-sealed" /> : null}
          <p className="mx-auto max-w-md text-muted first-letter:uppercase">{ruleText(seal)}</p>
          {seal.intervalSec > 0 ? (
            <p className="mx-auto max-w-md text-sm text-muted">
              The author renews this with a face scan. If they go silent, Arkiv lets the heartbeat expire and the seal opens.
            </p>
          ) : null}
          {seal.audience === "GATED" ? (
            <p className="flex items-center justify-center gap-2 text-sm text-sealed">
              <Globe2 className="size-4" aria-hidden /> {audienceText(seal)}
            </p>
          ) : null}
        </Card>
      ) : null}

      {status === "RELEASING" ? (
        <Card className="space-y-2 text-center">
          <Hourglass className="mx-auto size-8 text-sealed" aria-hidden />
          <p className="text-lg font-medium">The rule fired</p>
          <p className="text-sm text-muted">Waiting for the Chainlink CRE release on Sepolia. This page opens it automatically.</p>
        </Card>
      ) : null}

      {status === "DISARMED" ? (
        <Card className="space-y-2 text-center">
          <Ban className="mx-auto size-8 text-muted" aria-hidden />
          <p className="text-lg font-medium">Cancelled by the author.</p>
          <p className="text-sm text-muted">This will never open.</p>
        </Card>
      ) : null}

      {status === "RELEASED" ? <ReleasedView state={state} /> : null}

      {mine && cfg ? <SharePanel seal={seal} baseUrl={cfg.baseUrl} showPost={seal.contentType === "inline" || seal.source === "extension"} /> : null}

      <section aria-labelledby="proof" className="space-y-3">
        <h2 id="proof" className="flex items-center gap-2 text-sm font-medium text-muted">
          <Radio className="size-4" aria-hidden /> Proof
        </h2>
        <ProofLinks state={state} swarmGateway={cfg?.swarmGateway} sepoliaExplorer={cfg?.sepoliaExplorer} />
        <p className="text-xs text-muted">
          {loaded.via === "arkiv"
            ? "This page read the seal directly from Arkiv in your browser."
            : "Arkiv could not be reached from your browser; this page used the server as a relay."}{" "}
          Nobody, including the operators of this site, can delete it.
        </p>
      </section>
    </div>
  );
}
