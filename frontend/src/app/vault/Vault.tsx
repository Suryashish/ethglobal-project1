"use client";
import type { SealState } from "@iigs/core";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SealCard } from "@/components/SealCard";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getLocalSeals, getOwner, loadOwnerSeals, loadSealStatesViaApi } from "@/lib/client/seals";

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
      setSeals([...map.values()].sort((a, b) => b.seal.createdAt - a.seal.createdAt));
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

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">Your vault</h1>
          <p className="mt-2 text-muted">Every change of fate needs a live face check by you.</p>
        </div>
        <Link href="/vault/new" className={buttonStyles({ variant: "primary", size: "md" })}>
          <Plus className="size-4" aria-hidden /> Seal something
        </Link>
      </header>
      {error ? <p role="alert" className="text-sm text-danger">Could not load seals: {error}</p> : null}
      {seals === null ? (
        <p className="text-muted" role="status">Loading…</p>
      ) : seals.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-lg">Nothing sealed on this device yet.</p>
          <p className="mt-1 text-sm text-muted">Seal evidence or a post, and it appears here with a live countdown.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {seals.map((s) => (
            <SealCard key={s.seal.sealId} state={s} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
