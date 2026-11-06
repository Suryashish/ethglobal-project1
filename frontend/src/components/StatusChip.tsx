import type { SealStatus } from "@iigs/core";
import { Badge } from "./ui/Badge";

const MAP: Record<SealStatus, { tone: "sealed" | "released" | "danger" | "neutral"; label: string }> = {
  ARMED: { tone: "sealed", label: "ARMED" },
  RELEASING: { tone: "sealed", label: "RELEASING" },
  RELEASED: { tone: "released", label: "RELEASED" },
  DISARMED: { tone: "neutral", label: "DISARMED" },
};

export function StatusChip({ status }: { status: SealStatus }) {
  const m = MAP[status];
  return (
    <Badge tone={m.tone} className="tracking-wider">
      <span
        aria-hidden
        className={`size-1.5 rounded-full bg-current ${status === "ARMED" || status === "RELEASING" ? "pulse-dot" : ""}`}
      />
      {m.label}
    </Badge>
  );
}
