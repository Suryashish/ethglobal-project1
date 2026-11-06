export type Logger = (msg: string) => void;

const ts = () => new Date().toISOString().slice(11, 19);

export function makeLogger(prefix: string): { info: Logger; warn: Logger; error: Logger } {
  const line = (level: string, msg: string) => `${ts()} [${prefix}]${level} ${msg}`;
  return {
    info: (m) => console.log(line("", m)),
    warn: (m) => console.warn(line(" WARN", m)),
    error: (m) => console.error(line(" ERROR", m)),
  };
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e);
  return m.split("\n")[0]!.slice(0, 300);
}

/** Retries `fn` with exponential backoff. */
export async function retry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number; onRetry?: (e: unknown, n: number) => void; sleepFn?: (ms: number) => Promise<unknown> } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const base = opts.baseMs ?? 1000;
  const sl = opts.sleepFn ?? sleep;
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts) {
        opts.onRetry?.(e, i);
        await sl(base * 2 ** (i - 1));
      }
    }
  }
  throw last;
}
