"use client";
import { ExternalLink } from "lucide-react";
import { shareTargets } from "@/lib/share";
import { CopyButton } from "./CopyButton";
import { buttonStyles } from "./ui/Button";

/** Post on X · Post on Reddit (composer opens pre-filled) · Copy — for a cover phrase. */
export function ShareButtons({ phrase }: { phrase: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {shareTargets(phrase).map((t) => (
        <a
          key={t.id}
          href={t.href}
          target="_blank"
          rel="noopener noreferrer"
          data-share={t.id}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
          aria-label={`${t.label} (opens with the post already written)`}
        >
          {t.label}
          <ExternalLink className="size-3.5 opacity-60" />
        </a>
      ))}
      <CopyButton text={phrase} label="Copy" />
    </div>
  );
}
