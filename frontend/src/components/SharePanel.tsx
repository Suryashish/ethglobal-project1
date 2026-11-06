"use client";
import { formatSealedPost, readerUrl } from "@iigs/core";
import type { SealRecord } from "@iigs/core";
import { CopyButton } from "./CopyButton";
import { Card, Label } from "./ui/Card";

export function SharePanel({ seal, baseUrl, showPost = true }: { seal: Pick<SealRecord, "sealId" | "releaseAt" | "countries">; baseUrl: string; showPost?: boolean }) {
  const link = readerUrl(baseUrl, seal.sealId);
  const post = formatSealedPost({ sealId: seal.sealId, baseUrl, releaseAt: seal.releaseAt, countries: seal.countries });
  return (
    <Card className="space-y-4">
      <div>
        <Label>Share link</Label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 break-all rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm">{link}</code>
          <CopyButton text={link} label="Copy link" />
        </div>
      </div>
      {showPost ? (
        <div>
          <Label>Sealed post (paste into X, Reddit, anywhere)</Label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
            <p className="flex-1 break-words rounded-md border border-line bg-bg px-3 py-2 text-sm">{post}</p>
            <CopyButton text={post} label="Copy post" />
          </div>
          <p className="mt-2 text-xs text-muted">The Silent Seal extension turns this into a live countdown, and decrypts it in the feed once it opens.</p>
        </div>
      ) : null}
    </Card>
  );
}
