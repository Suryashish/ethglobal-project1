"use client";
import type { SealState } from "@iigs/core";
import { BellRing, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { SealCard } from "@/components/SealCard";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useNowSec } from "@/lib/client/hooks";
import { getLocalSeals, getOwner, loadOwnerSeals, loadSealStatesViaApi } from "@/lib/client/seals";
import { byUrgency, needsCheckIn } from "@/lib/rules";

export function Vault() {
  const [seals, setSeals] = useState<SealState[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const owner = getOwner();
    const ids = getLocalSeals();
    try {
      const [byOwner, byId] = await Promise.all([
        owner ? loadOwnerSeals(owner) : Promise.resolve([] as SealState[]),
        loadSealStatesViaApi(ids),
      ]);
      const map = new Map<string, SealState>();
      for (const s of [...byOwner, ...Object.values(byId)]) map.set(s.seal.sealId, s);
      setSeals([...map.values()].sort(byUrgency));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSeals((s) => s ?? []);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const count = (st: SealState["status"]) => seals?.filter((s) => s.status === st).length ?? 0;
  const now = useNowSec(15_000);
  const due = seals?.filter((s) => needsCheckIn(s, now)) ?? [];

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-[44px] leading-none tracking-[-0.02em] sm:text-[56px]">Your seals</h1>
          <p className="mt-3 flex items-center gap-2 text-[15px] text-muted">
            <ShieldCheck className="size-4 text-released" aria-hidden />
            Every change of fate needs a live face check by you.
          </p>
        </div>
        {seals && seals.length > 0 ? (
          <dl className="panel flex divide-x divide-line overflow-hidden rounded-xl text-sm">
            {(
              [
                ["Armed", count("ARMED") + count("RELEASING"), "text-sealed"],
                ["Opened", count("RELEASED"), "text-released"],
                ["Disarmed", count("DISARMED"), "text-muted"],
              ] as const
            ).map(([k, v, c]) => (
              <div key={k} className="px-5 py-2.5">
                <dt className="text-[13px] text-muted">{k}</dt>
                <dd className={`font-serif text-[28px] leading-tight tabular ${c}`}>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>

      {due.length ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-sealed/30 bg-sealed-soft px-4 py-3 text-sm text-sealed">
          <BellRing className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            {due.length === 1
              ? `“${due[0]!.seal.title || "Untitled seal"}” needs a check-in soon. Tap I'm OK on it below.`
              : `${due.length} seals need a check-in soon. They're at the top.`}
          </span>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger/[0.05] px-4 py-3 text-sm text-danger">
          Could not load seals: {error}
        </p>
      ) : null}

      {seals === null ? (
        <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Loading">
          {[0, 1].map((i) => (
            <div key={i} className="panel h-56 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : seals.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <LogoMark className="size-14" />
          <p className="mt-6 font-serif text-[28px] leading-tight">Nothing sealed on this device yet.</p>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Seal evidence or a post, and it appears here with a live countdown. Seals made on another browser stay there.
          </p>
          <Link href="/app/new" className={buttonStyles({ variant: "primary", size: "md", className: "mt-8" })}>
            <Plus className="size-4" aria-hidden /> Seal something
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {seals.map((s) => (
            <SealCard key={s.seal.sealId} state={s} onChanged={refresh} />
          ))}
        </div>
      )}

      <p className="text-[13px] text-faint">
        Your seals are remembered by this browser. Arm them from the device you&apos;ll keep with you, and don&apos;t clear its site data.
      </p>
    </div>
  );
}
