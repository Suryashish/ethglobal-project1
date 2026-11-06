export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${String(m).padStart(2, "0")}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  return `${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

/** Human phrasing of an interval, e.g. 120 -> "2 minutes", 432000 -> "5 days". */
export function humanInterval(sec: number): string {
  if (sec % 86400 === 0 && sec >= 86400) return `${sec / 86400} day${sec / 86400 === 1 ? "" : "s"}`;
  if (sec % 3600 === 0 && sec >= 3600) return `${sec / 3600} hour${sec / 3600 === 1 ? "" : "s"}`;
  if (sec % 60 === 0) return `${sec / 60} minute${sec / 60 === 1 ? "" : "s"}`;
  return `${sec} seconds`;
}

export function formatDateTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const COUNTRIES: { code: string; name: string }[] = [
  ["IN", "India"], ["MT", "Malta"], ["US", "United States"], ["GB", "United Kingdom"], ["DE", "Germany"],
  ["FR", "France"], ["BR", "Brazil"], ["NG", "Nigeria"], ["KE", "Kenya"], ["PH", "Philippines"],
  ["MX", "Mexico"], ["TR", "Türkiye"], ["RU", "Russia"], ["BY", "Belarus"], ["UA", "Ukraine"],
  ["EG", "Egypt"], ["SA", "Saudi Arabia"], ["AE", "United Arab Emirates"], ["PK", "Pakistan"], ["BD", "Bangladesh"],
  ["CN", "China"], ["HK", "Hong Kong"], ["JP", "Japan"], ["KR", "South Korea"], ["ID", "Indonesia"],
  ["ZA", "South Africa"], ["AR", "Argentina"], ["CO", "Colombia"], ["VE", "Venezuela"], ["IT", "Italy"],
  ["ES", "Spain"], ["NL", "Netherlands"], ["PL", "Poland"], ["CA", "Canada"], ["AU", "Australia"],
].map(([code, name]) => ({ code: code!, name: name! }));

export function flag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
