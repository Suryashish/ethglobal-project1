import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { FeedDemo } from "@/components/landing/FeedDemo";
import { SealedLetter } from "@/components/landing/SealedLetter";
import { Logo, WaxSeal } from "@/components/Logo";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const STEPS = [
  {
    title: "You seal it",
    body: "Write a message or attach a file of up to 10 MB. It is encrypted on your own device before anything leaves it.",
    by: "Your browser",
  },
  {
    title: "Your face signs it",
    body: "A live face check ties the seal to you. Someone holding your phone can't check in for you, or quietly cancel it.",
    by: "World ID",
  },
  {
    title: "You keep checking in",
    body: "Each check-in is a public record that expires on its own. If you go quiet, it lapses. Nobody has to notice.",
    by: "Arkiv",
  },
  {
    title: "The world reads it",
    body: "An independent workflow sees the silence and records the release on-chain. Anyone, anywhere, can open it.",
    by: "Chainlink CRE and Swarm",
  },
] as const;

const MODES = [
  ["On a date", "Opens at the time you choose, unless you cancel it first."],
  ["If I go silent", "Opens when you stop checking in. Every check-in is one face scan."],
  ["For chosen readers", "Opens only for verified readers from the countries you pick."],
] as const;

export default function Home() {
  return (
    <div className="relative">
      <LandingNav />

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-16 px-5 pb-24 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
        <div className="rise">
          <p className="text-[15px] text-muted">For journalists, whistleblowers, and anyone who might be silenced.</p>
          <h1 className="mt-6 font-serif text-[56px] font-normal leading-[0.98] tracking-[-0.025em] text-fg sm:text-[84px]">
            If I go silent,
            <br />
            <em className="italic">
              the <span className="marker">truth</span> doesn&apos;t.
            </em>
          </h1>
          <p className="mt-8 max-w-[34rem] text-[17px] leading-[1.65] text-ink-soft">
            Seal your evidence today. If you stop checking in, it opens to the world, on its own. Not a government, not a thief with
            your phone, not even us can stop it.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/app/new" className={buttonStyles({ variant: "primary", size: "lg" })}>
              Seal something <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a href="#how" className={buttonStyles({ variant: "secondary", size: "lg" })}>
              How it works
            </a>
          </div>
          <p className="mt-6 text-[13px] text-faint">Free and open source. Running on Sepolia testnet.</p>
        </div>
        <div className="rise" style={{ animationDelay: "120ms" }}>
          <SealedLetter />
        </div>
      </section>

      {/* Why */}
      <section className="border-y border-line bg-surface/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-24 sm:px-8 sm:py-32 md:grid-cols-[13rem_1fr] md:gap-16">
          <p className="font-serif text-[15px] italic text-muted md:pt-3">Malta, October 2017</p>
          <div className="max-w-3xl">
            <p className="font-serif text-[30px] leading-[1.3] tracking-[-0.01em] text-fg sm:text-[40px]">
              Daphne Caruana Galizia was killed by a car bomb. Her killers wanted her investigations to die with her.
            </p>
            <p className="mt-6 font-serif text-[30px] leading-[1.3] tracking-[-0.01em] text-muted sm:text-[40px]">
              They didn&apos;t. Forty-five journalists from eighteen outlets picked up her work and finished it. But that took a
              coalition, and luck.
            </p>
            <p className="mt-10 text-[17px] text-ink-soft">
              <span className="marker">If I Go Silent makes it automatic.</span> No coalition required.
            </p>
          </div>
        </div>
      </section>

      {/* How */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
        <div className="max-w-2xl">
          <h2 className="font-serif text-[40px] leading-[1.08] tracking-[-0.02em] sm:text-[52px]">
            Four independent parts.
            <br />
            <span className="text-muted">No single off switch.</span>
          </h2>
        </div>
        <ol className="mt-16 grid gap-x-16 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[3rem_1fr] gap-4 border-t border-line py-8">
              <span className="font-serif text-[40px] leading-none text-sealed">{i + 1}</span>
              <div>
                <h3 className="text-lg font-medium text-fg">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
                <p className="mt-4 font-mono text-xs text-faint">{s.by}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-20 rounded-2xl border border-line bg-surface-2/70 p-2">
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map(([t, b]) => (
              <div key={t} className="rounded-xl bg-surface px-6 py-6 shadow-[0_1px_2px_rgb(60_45_25/0.06)]">
                <h3 className="font-serif text-[22px] leading-tight">{t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Extension */}
      <section id="extension" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 md:grid-cols-[1fr_1.05fr] md:gap-20">
          <div>
            <p className="font-serif text-[15px] italic text-muted">The Silent Seal browser extension</p>
            <h2 className="mt-4 font-serif text-[40px] leading-[1.08] tracking-[-0.02em] sm:text-[52px]">Hide it in plain sight.</h2>
            <p className="mt-6 text-[17px] leading-[1.65] text-ink-soft">
              Seal a post on X or Reddit straight from your browser. It goes out as two ordinary sentences that quietly carry the seal.
              Nothing about it looks unusual, until the day it opens.
            </p>
            <ul className="mt-8 space-y-4 text-[15px] text-muted">
              <li className="border-l-2 border-line-strong pl-4">The text is encrypted inside the extension and never leaves your device readable.</li>
              <li className="border-l-2 border-line-strong pl-4">One face check arms it. There is nothing else to set up.</li>
              <li className="border-l-2 border-line-strong pl-4">You can limit it to verified readers from the countries you choose.</li>
            </ul>
          </div>
          <FeedDemo />
        </div>
      </section>

      {/* Closing */}
      <section className="px-3 pb-3 sm:px-5 sm:pb-5">
        <div className="relative mx-auto max-w-[88rem] overflow-hidden rounded-3xl bg-[#1d1b17] px-6 py-24 text-center text-[#f5f0e6] sm:py-32">
          <WaxSeal className="mx-auto size-16 drop-shadow-[0_8px_14px_rgb(0_0_0/0.45)]" />
          <h2 className="mx-auto mt-10 max-w-3xl font-serif text-[44px] leading-[1.05] tracking-[-0.02em] sm:text-[68px]">
            The switch protects you <em className="italic text-[#f3d983]">by existing.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-[17px] leading-relaxed text-[#bdb4a5]">
            Anyone who wants you quiet can see that it&apos;s armed. Silencing you would publish everything.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/app/new"
              className={cn(buttonStyles({ size: "lg" }), "border-0 bg-[#f5f0e6] text-[#1d1b17] hover:bg-white")}
            >
              Seal something <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/verify-reader"
              className={cn(buttonStyles({ variant: "ghost", size: "lg" }), "text-[#bdb4a5] hover:bg-white/10 hover:text-[#f5f0e6]")}
            >
              I&apos;m a reader
            </Link>
          </div>
        </div>
      </section>

      <footer>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 text-sm text-muted sm:flex-row sm:px-8">
          <Logo />
          <p className="text-faint">Built at ETHGlobal Mumbai 2026 with World ID, Arkiv, Chainlink CRE and Swarm.</p>
          <nav className="flex gap-5" aria-label="Footer">
            <Link className="hover:text-fg" href="/app">App</Link>
            <Link className="hover:text-fg" href="/verify-reader">Readers</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1 text-[15px]" aria-label="Main">
          <a href="#how" className="hidden rounded-md px-3 py-1.5 text-muted transition-colors hover:text-fg sm:block">
            How it works
          </a>
          <a href="#extension" className="hidden rounded-md px-3 py-1.5 text-muted transition-colors hover:text-fg sm:block">
            Extension
          </a>
          <Link href="/app" className={cn(buttonStyles({ variant: "secondary", size: "sm" }), "ml-3")}>
            Open the app
          </Link>
        </nav>
      </div>
    </header>
  );
}
