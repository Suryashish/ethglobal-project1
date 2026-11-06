import { ExternalLink } from "lucide-react";
import type { SealState } from "@iigs/core";
import { ARKIV_EXPLORER } from "@/lib/client/seals";

export function ProofLinks({
  state,
  swarmGateway = "https://api.gateway.ethswarm.org",
  sepoliaExplorer = "https://sepolia.etherscan.io",
}: {
  state: SealState;
  swarmGateway?: string;
  sepoliaExplorer?: string;
}) {
  const links: { label: string; href: string; sub: string }[] = [
    { label: "Arkiv seal entity", href: `${ARKIV_EXPLORER}/entity/${state.seal.entityKey}`, sub: short(state.seal.entityKey) },
  ];
  if (state.seal.swarmRef) {
    links.push({
      label: "Swarm ciphertext",
      href: `${swarmGateway.replace(/\/+$/, "")}/bytes/${state.seal.swarmRef}`,
      sub: short(state.seal.swarmRef),
    });
  }
  if (state.release) {
    links.push({ label: "Arkiv release entity", href: `${ARKIV_EXPLORER}/entity/${state.release.entityKey}`, sub: short(state.release.entityKey) });
    if (state.release.sepoliaTx && /^0x[0-9a-fA-F]{64}$/.test(state.release.sepoliaTx)) {
      links.push({ label: "Sepolia release tx", href: `${sepoliaExplorer}/tx/${state.release.sepoliaTx}`, sub: short(state.release.sepoliaTx) });
    }
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {links.map((l) => (
        <li key={l.href}>
          <a
            href={l.href}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center justify-between gap-3 group rounded-xl border border-line bg-surface px-4 py-3 text-sm transition-colors hover:border-line-strong"
          >
            <span>
              <span className="block text-fg">{l.label}</span>
              <span className="block font-mono text-xs text-faint">{l.sub}</span>
            </span>
            <ExternalLink className="size-4 shrink-0 text-faint transition-colors group-hover:text-fg" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}

const short = (s: string) => (s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s);
