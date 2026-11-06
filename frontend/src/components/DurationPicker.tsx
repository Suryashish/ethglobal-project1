"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { humanInterval } from "@/lib/format";

// Short ones are for trying it out; the long ones are what a real dead-man's switch uses.
export const PRESETS = [
  { sec: 120, label: "2 min" },
  { sec: 300, label: "5 min" },
  { sec: 3600, label: "1 hour" },
  { sec: 86400, label: "1 day" },
  { sec: 5 * 86400, label: "5 days" },
  { sec: 30 * 86400, label: "30 days" },
] as const;
const UNITS = { minutes: 60, hours: 3600, days: 86400 } as const;

export function DurationPicker({
  value,
  onChange,
  min = 0,
  legend,
}: {
  value: number;
  onChange: (sec: number) => void;
  min?: number;
  legend: string;
}) {
  const isPreset = PRESETS.some((p) => p.sec === value);
  const [custom, setCustom] = useState(!isPreset);
  const [n, setN] = useState(10);
  const [unit, setUnit] = useState<keyof typeof UNITS>("minutes");

  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-sm font-medium text-ink-soft">{legend}</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label={legend}>
        {PRESETS.map((p) => (
          <button
            key={p.sec}
            type="button"
            aria-pressed={!custom && value === p.sec}
            onClick={() => {
              setCustom(false);
              onChange(p.sec);
            }}
            className={chip(!custom && value === p.sec)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => {
            setCustom(true);
            onChange(Math.max(min, n * UNITS[unit]));
          }}
          className={chip(custom)}
        >
          Custom
        </button>
      </div>
      {custom ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={n}
            aria-label={`${legend} amount`}
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1);
              setN(v);
              onChange(Math.max(min, v * UNITS[unit]));
            }}
            className="h-10 w-24 rounded-lg border border-line bg-field px-3 text-sm tabular"
          />
          <select
            value={unit}
            aria-label={`${legend} unit`}
            onChange={(e) => {
              const u = e.target.value as keyof typeof UNITS;
              setUnit(u);
              onChange(Math.max(min, n * UNITS[u]));
            }}
            className="h-10 rounded-lg border border-line bg-field px-3 text-sm"
          >
            {Object.keys(UNITS).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
      ) : null}
      <p className="text-[13px] text-faint">That is {humanInterval(value)}{min ? ` (minimum ${humanInterval(min)})` : ""}</p>
    </fieldset>
  );
}

const chip = (on: boolean) =>
  cn(
    "h-9 cursor-pointer rounded-md border px-3.5 text-[14px] transition-colors",
    on ? "border-fg bg-fg text-[#fbf8f2]" : "border-line bg-field text-ink-soft hover:border-line-strong hover:text-fg",
  );
