"use client";
import type { SealState } from "@iigs/core";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { PRESETS } from "./DurationPicker";
import { OwnerActionButton } from "./OwnerAction";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { useNowSec } from "@/lib/client/hooks";
import { formatDateTime } from "@/lib/format";
import { effectiveStatus } from "@/lib/rules";

type Dlg = null | "disarm" | "release" | "extend";

/**
 * The author's controls for one seal: I'm OK · Extend timer · Release now · Disarm.
 * Each one asks for a live face check by the same human who armed it. Used on the dashboard and on the seal page.
 */
export function SealActions({ state, onChanged, trailing }: { state: SealState; onChanged: () => void; trailing?: ReactNode }) {
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

  if (!live && !trailing) return null;
  return (
    <>
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
        {trailing}
      </div>

      <Modal
        open={dlg === "disarm"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Disarm this seal forever?"
        description="This is permanent. The seal will never open, for anyone. A face check is required."
      >
        <div className="flex flex-wrap gap-2">
          <OwnerActionButton
            action="disarm"
            sealId={seal.sealId}
            sessionId={seal.ownerNullifier}
            label="Disarm with World ID"
            variant="danger"
            size="md"
            onDone={done("Disarmed. This seal will never open.")}
          />
          <Button variant="ghost" onClick={() => setDlg(null)}>Keep it armed</Button>
        </div>
      </Modal>
      <Modal
        open={dlg === "release"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Publish now?"
        description="The seal opens at the next release sweep (about 30 seconds) and cannot be undone."
      >
        <div className="flex flex-wrap gap-2">
          <OwnerActionButton
            action="release-now"
            sealId={seal.sealId}
            sessionId={seal.ownerNullifier}
            label="Release now with World ID"
            variant="primary"
            size="md"
            onDone={done("Release requested.")}
          />
          <Button variant="ghost" onClick={() => setDlg(null)}>Not yet</Button>
        </div>
      </Modal>
      <Modal
        open={dlg === "extend"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Extend the timer"
        description={`Currently opens ${formatDateTime(seal.releaseAt)}.`}
      >
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Extend by">
          {PRESETS.map((p) => (
            <Button
              key={p.sec}
              size="sm"
              aria-pressed={extendBy === p.sec}
              variant={extendBy === p.sec ? "primary" : "secondary"}
              onClick={() => setExtendBy(p.sec)}
            >
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
    </>
  );
}
