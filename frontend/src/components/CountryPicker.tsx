"use client";
import { cn } from "@/lib/cn";
import { COUNTRIES, flag } from "@/lib/format";

export function CountryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-medium text-ink-soft">Countries allowed to read</legend>
      <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-xl border border-line bg-surface-2/60 p-2.5">
        {COUNTRIES.map((c) => {
          const on = value.includes(c.code);
          return (
            <button
              key={c.code}
              type="button"
              aria-pressed={on}
              title={c.name}
              onClick={() => onChange(on ? value.filter((x) => x !== c.code) : [...value, c.code])}
              className={cn(
                "cursor-pointer rounded-md border px-2.5 py-1 text-[13px] transition-colors",
                on ? "border-fg bg-fg text-[#fbf8f2]" : "border-line bg-field text-ink-soft hover:border-line-strong hover:text-fg",
              )}
            >
              {flag(c.code)} {c.code}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] text-faint">
        Readers prove their nationality with a World ID passport check. Nothing else (no name, no birthdate) is revealed.
      </p>
    </fieldset>
  );
}
