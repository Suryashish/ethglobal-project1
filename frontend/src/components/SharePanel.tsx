"use client";
import { encodeCover, readerUrl } from "@iigs/core";
import type { SealRecord } from "@iigs/core";
import { CopyButton } from "./CopyButton";
import { ShareButtons } from "./ShareButtons";
import { Card, Label } from "./ui/Card";

export function SharePanel({ seal, baseUrl, showPost = true }: { seal: Pick<SealRecord, "sealId">; baseUrl: string; showPost?: boolean }) {
  const link = readerUrl(baseUrl, seal.sealId);
  const phrase = encodeCover(seal.sealId);

  return (
    <Card className="space-y-4">
      {showPost ? (
        <div>
          <Label>Hidden post</Label>
          <p data-cover-phrase className="mt-2 break-words rounded-xl border border-line bg-field px-4 py-3 font-serif text-[17px] leading-relaxed">{phrase}</p>
          <p className="mt-2 text-xs leading-relaxed text-faint">
            Post this exactly as it is. It reads like an ordinary post and says nothing about a seal. Once the seal opens, the Silent
            Seal extension finds it on X and Reddit and shows what you sealed right under it: the message, a picture inline, or any other
            file as a download.
          </p>
          <div className="mt-3">
            <ShareButtons phrase={phrase} />
          </div>
        </div>
      ) : null}
      <div>
        <Label>Share link</Label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 break-all rounded-lg border border-line bg-field px-3.5 py-2.5 font-mono text-[13px]">{link}</code>
          <CopyButton text={link} label="Copy link" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-faint">The public seal page: a live countdown, for people who want to know a seal exists.</p>
      </div>
    </Card>
  );
}
