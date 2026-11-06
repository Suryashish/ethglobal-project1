/** "3d 4h", "4h 5m", "5m 12s", "42s", "now". */
export function formatCountdown(secs: number): string {
  const s = Math.floor(secs);
  if (s <= 0) return "now";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

export function formatDuration(secs: number): string {
  if (secs % 86400 === 0) return `${secs / 86400} day${secs === 86400 ? "" : "s"}`;
  if (secs % 3600 === 0) return `${secs / 3600} hour${secs === 3600 ? "" : "s"}`;
  if (secs % 60 === 0) return `${secs / 60} min`;
  return `${secs}s`;
}

export const nowSec = () => Math.floor(Date.now() / 1000);

/** Reader token expiry may arrive in seconds or milliseconds. */
export function expiresAtMs(expiresAt: number): number {
  return expiresAt > 1e12 ? expiresAt : expiresAt * 1000;
}
