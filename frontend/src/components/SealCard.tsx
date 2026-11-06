"use client";
import type { SealState } from "@iigs/core";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Countdown } from "./Countdown";
import { OwnerActionButton } from "./OwnerAction";
import { StatusChip } from "./StatusChip";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Modal } from "./ui/Modal";
import { PRESETS } from "./DurationPicker";
import { useNowSec } from "@/lib/client/hooks";
import { deadlineLabel, effectiveStatus, ruleText } from "@/lib/rules";
import { formatDateTime } from "@/lib/format";

type Dlg = null | "disarm" | "release" | "extend";

export function SealCard({ state, onChanged }: { state: SealState; onChanged: () => void }) {
  const { seal } = state;
  const now = useNowSec(1000);
  const status = effectiveStatus(state, now);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [extendBy, setExtendBy] = useState<number>(PRESETS[0].sec);
  const live = status === "ARMED" || status === "RELEASING";
  const done = (msg: string) => () => {
    toast.success(msg);
    setDlg(null);
    onChanged();
    setTimeout(onChanged, 4000);
  };
  const newRelease = Math.max(seal.releaseAt, now) + extendBy;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/s/${seal.sealId}`} className="block truncate text-lg font-medium hover:text-sealed">
            {seal.title || "Untitled seal"}
          </Link>
          <p className="font-mono text-xs text-muted">{seal.sealId}</p>
        </div>
        <StatusChip status={status} />
      </div>
      <p className="text-sm text-muted first-letter:uppercase">
        {ruleText(seal)} · {seal.audience === "GATED" ? `readers from ${seal.countries.join(", ")}` : "public"}
      </p>
      {status === "ARMED" && state.nextDeadline ? (
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">{deadlineLabel(state.nextDeadlineRule)}</p>
          <Countdown to={state.nextDeadline} className="text-2xl text-sealed" />
        </div>
      ) : null}
      {status === "RELEASING" ? <p className="text-sm text-sealed">The rule fired. Waiting for the Chainlink CRE release.</p> : null}
      {status === "DISARMED" ? <p className="text-sm text-muted">Cancelled. It will never open.</p> : null}
      {status === "RELEASED" ? <p className="text-sm text-released">Released{state.release ? ` ${formatDateTime(state.release.releasedAt)}` : ""}.</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {status === "ARMED" && seal.intervalSec > 0 ? (
          <OwnerActionButton
            action="checkin"
            sealId={seal.sealId}
            sessionId={seal.ownerNullifier}
            label="I'm OK"
            variant="primary"
            onDone={done("Checked in. The heartbeat is renewed.")}
          />
        ) : null}
        {status === "ARMED" && seal.kind !== "HEARTBEAT" ? (
          <Button size="sm" onClick={() => setDlg("extend")}>Extend timer</Button>
        ) : null}
        {live ? (
          <>
            {status === "ARMED" ? <Button size="sm" onClick={() => setDlg("release")}>Release now</Button> : null}
            <Button size="sm" variant="danger" onClick={() => setDlg("disarm")}>Disarm</Button>
          </>
        ) : null}
        <Link href={`/s/${seal.sealId}`} className="ml-auto text-sm text-muted hover:text-fg">Open reader page →</Link>
      </div>

      <Modal
        open={dlg === "disarm"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Disarm this seal forever?"
        description="This is permanent. The seal will never open, for anyone. A face check is required."
      >
        <OwnerActionButton
          action="disarm"
          sealId={seal.sealId}
          sessionId={seal.ownerNullifier}
          label="Disarm with World ID"
          variant="danger"
          size="md"
          onDone={done("Disarmed. This seal will never open.")}
        />
      </Modal>
      <Modal
        open={dlg === "release"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Publish now?"
        description="The seal opens at the next release sweep (about 30 seconds) and cannot be undone."
      >
        <OwnerActionButton
          action="release-now"
          sealId={seal.sealId}
          sessionId={seal.ownerNullifier}
          label="Release now with World ID"
          variant="primary"
          size="md"
          onDone={done("Release requested.")}
        />
      </Modal>
      <Modal
        open={dlg === "extend"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Extend the timer"
        description={`Currently opens ${formatDateTime(seal.releaseAt)}.`}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.sec} size="sm" variant={extendBy === p.sec ? "primary" : "secondary"} onClick={() => setExtendBy(p.sec)}>
              +{p.label}
            </Button>
          ))}
        </div>
        <p className="mb-4 text-sm text-muted">New release time: {formatDateTime(newRelease)}</p>
        <OwnerActionButton
          action="extend"
          sealId={seal.sealId}
          sessionId={seal.ownerNullifier}
          extra={String(newRelease)}
          body={{ releaseAt: newRelease }}
          label="Extend with World ID"
          variant="primary"
          size="md"
          onDone={done("Timer extended.")}
        />
      </Modal>
    </Card>
  );
}
