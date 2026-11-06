"use client";
import type { SealState } from "@iigs/core";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Countdown } from "./Countdown";
import { SealActions } from "./SealActions";
import { StatusChip } from "./StatusChip";
import { Card } from "./ui/Card";
import { useNowSec } from "@/lib/client/hooks";
import { cn } from "@/lib/cn";
import { deadlineLabel, effectiveStatus, needsCheckIn, ruleText } from "@/lib/rules";
import { formatDateTime } from "@/lib/format";

export function SealCard({ state, onChanged }: { state: SealState; onChanged: () => void }) {
  const { seal } = state;
  const now = useNowSec(1000);
  const status = effectiveStatus(state, now);
  const urgent = needsCheckIn(state, now);

  return (
    <Card className={cn("space-y-4 transition-colors hover:border-line-strong", urgent && "border-sealed/45 hover:border-sealed/60")}>
      <div className="flex items-start justify-between gap-3">
        <StatusChip status={status} />
        <span className="font-mono text-xs text-faint">{seal.sealId}</span>
      </div>
      <div className="min-w-0">
        <Link href={`/s/${seal.sealId}`} className="block truncate font-serif text-[26px] leading-tight transition-colors hover:text-sealed">
          {seal.title || "Untitled seal"}
        </Link>
        <p className="mt-1.5 text-sm text-muted first-letter:uppercase">
          {ruleText(seal)} · {seal.audience === "GATED" ? `readers from ${seal.countries.join(", ")}` : "public"}
        </p>
      </div>
      {status === "ARMED" && state.nextDeadline ? (
        <div className={cn("rounded-xl border px-4 py-3", urgent ? "border-sealed/30 bg-sealed-soft" : "border-line bg-field")}>
          <p className={cn("text-[13px]", urgent ? "font-medium text-sealed" : "text-muted")}>
            {urgent ? "Check in soon, or this opens in" : deadlineLabel(state.nextDeadlineRule)}
          </p>
          <Countdown to={state.nextDeadline} className="mt-0.5 block text-2xl font-medium text-sealed" />
        </div>
      ) : null}
      {status === "RELEASING" ? (
        <p className="rounded-xl border border-sealed/20 bg-sealed-soft px-4 py-3 text-sm text-sealed">The rule fired. Waiting for the Chainlink CRE release.</p>
      ) : null}
      {status === "DISARMED" ? <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">Cancelled. It will never open.</p> : null}
      {status === "RELEASED" ? (
        <p className="rounded-xl border border-released/20 bg-released-soft px-4 py-3 text-sm text-released">
          Released{state.release ? ` ${formatDateTime(state.release.releasedAt)}` : ""}.
        </p>
      ) : null}

      <div className="border-t border-line pt-4">
        <SealActions
          state={state}
          onChanged={onChanged}
          trailing={
            <Link href={`/s/${seal.sealId}`} className="ml-auto inline-flex items-center gap-1 rounded-md px-1 text-sm text-muted transition-colors hover:text-fg">
              Seal page <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
      </div>
    </Card>
  );
}
