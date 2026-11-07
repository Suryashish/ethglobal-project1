"use client";
import { useEffect, useState } from "react";

/** Current unix seconds, ticking every `ms`. 0 until mounted (avoids SSR/hydration mismatch). */
export function useNowSec(ms = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const t = setInterval(tick, ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** A unix timestamp for World signals, refreshed every minute (server accepts 10 minutes). */
export function useIssuedAt(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const tick = () => setT(Math.floor(Date.now() / 1000));
    tick();
    const i = setInterval(tick, 60 * 1000); // WorldVerifyButton freezes the signal when a flow starts; this only bounds how stale that start can be
    return () => clearInterval(i);
  }, []);
  return t;
}

export function useLocalStorageValue<T>(read: () => T, initial: T): T {
  const [v, setV] = useState<T>(initial);
  useEffect(() => setV(read()), []); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
