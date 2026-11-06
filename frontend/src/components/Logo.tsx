import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/cn";

// A hand-poured wax blob: a circle whose edge wanders a little (deterministic, so SSR and client agree).
function blobPath(cx: number, cy: number, r: number, wobble: number, n = 28): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = r + wobble * (Math.sin(a * 3 + 0.6) * 0.55 + Math.sin(a * 7 + 1.9) * 0.3 + Math.sin(a * 11) * 0.15);
    pts.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k]);
  }
  // smooth closed curve through the points (Catmull-Rom → cubic Bézier)
  let d = `M${pts[0]![0].toFixed(2)} ${pts[0]![1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!, p1 = pts[i]!, p2 = pts[(i + 1) % n]!, p3 = pts[(i + 2) % n]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]!.toFixed(2)} ${c1[1]!.toFixed(2)} ${c2[0]!.toFixed(2)} ${c2[1]!.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + "Z";
}
const OUTER = blobPath(32, 32, 29, 1.6);
const PULSE = "M14 34h8.5l4.2-11 7 20 4.3-9H50";

/** The mark: a wax seal with a heartbeat pressed into it. */
export function WaxSeal({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={`w${id}`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#c44a3e" />
          <stop offset="0.55" stopColor="#a8352b" />
          <stop offset="1" stopColor="#7d241c" />
        </radialGradient>
      </defs>
      <path d={OUTER} fill={`url(#w${id})`} />
      <circle cx="32" cy="32" r="21" fill="none" stroke="#7a221a" strokeOpacity="0.55" strokeWidth="1.6" />
      <circle cx="32" cy="32.8" r="21" fill="none" stroke="#e07a6c" strokeOpacity="0.35" strokeWidth="0.9" />
      {/* the pressed line: a dark groove with a light lip underneath */}
      <path d={PULSE} fill="none" stroke="#f0a196" strokeOpacity="0.55" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 1)" />
      <path d={PULSE} fill="none" stroke="#6e1d16" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="23" cy="18" rx="7" ry="3.2" fill="#fff" opacity="0.13" transform="rotate(-28 23 18)" />
    </svg>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return <WaxSeal className={cn("size-7", className)} />;
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("group flex items-center gap-2.5", className)} aria-label="IF I GO SILENT, home">
      <LogoMark className="transition-transform duration-300 group-hover:-rotate-12" />
      <span className="whitespace-nowrap font-serif text-[19px] font-medium tracking-[-0.01em] text-fg">If I Go Silent</span>
    </Link>
  );
}
