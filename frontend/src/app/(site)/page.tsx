import Link from "next/link";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const STEPS = [
  ["World proves it's her", "A live face check (World ID Selfie Check) ties every seal to one human. A thief holding the phone is refused."],
  ["Arkiv remembers", "The seal and a heartbeat that expires on its own live on Arkiv. When she goes silent, the heartbeat simply disappears."],
  ["Chainlink CRE decides", "An independent workflow reads Arkiv, applies the rule and writes the release to Sepolia. Nobody here can release early or hold it back."],
  ["Swarm stores", "The encrypted file sits on Swarm. Once released, anyone can fetch it and open it in their own browser."],
] as const;

export default function Home() {
  return (
    <div className="space-y-20">
      <section className="space-y-8 pt-4 sm:pt-10">
        <p className="text-xs uppercase tracking-[0.25em] text-sealed">A dead-man&apos;s switch for people who might be silenced</p>
        <h1 className="font-serif text-4xl leading-[1.1] sm:text-6xl">
          If I go silent,
          <br />
          the truth doesn&apos;t.
        </h1>
        <div className="max-w-2xl space-y-4 text-lg leading-relaxed text-muted">
          <p>
            In October 2017, Maltese journalist <span className="text-fg">Daphne Caruana Galizia</span> was killed by a car bomb. Her killers wanted
            her investigations to die with her. They didn&apos;t: <span className="text-fg">45 journalists from 18 outlets</span> finished them, in
            The Daphne Project. But that took a nonprofit, a coalition, and luck.
          </p>
          <p>
            IF I GO SILENT makes it automatic. Seal your evidence or your post. If you stop checking in, or the timer runs out, it opens to the
            world, and nobody can stop it: not a government, not a hacker who steals your phone, not us.
          </p>
          <p className="text-fg">The switch protects you by existing: silencing you publishes everything.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/vault" className={buttonStyles({ variant: "primary", size: "lg" })}>Open the Vault</Link>
          <Link href="/vault/new" className={buttonStyles({ variant: "secondary", size: "lg" })}>Seal something</Link>
        </div>
      </section>

      <section aria-labelledby="how" className="space-y-6">
        <h2 id="how" className="text-sm font-medium uppercase tracking-[0.2em] text-muted">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map(([t, b], i) => (
            <li key={t}>
              <Card className="h-full">
                <span className="font-mono text-sm text-sealed">0{i + 1}</span>
                <h3 className="mt-2 text-lg font-medium">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Timer", "Opens at a set time unless you cancel it."],
          ["Dead-man", "Opens if you stop checking in with a face scan."],
          ["Country-gated", "Opens only for verified readers from countries you choose."],
        ].map(([t, b]) => (
          <Card key={t}>
            <h3 className="font-medium">{t}</h3>
            <p className="mt-1 text-sm text-muted">{b}</p>
          </Card>
        ))}
      </section>

      <section>
        <Card className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-medium">Silent Seal, the browser extension</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Seal a post on X or Reddit in two clicks. Followers with the extension watch it count down in the feed, and read it in place when it opens.
            </p>
          </div>
          <Link href="/verify-reader" className={buttonStyles({ variant: "secondary" })}>Verify as a reader</Link>
        </Card>
      </section>
    </div>
  );
}
