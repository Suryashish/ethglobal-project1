import { SiteHeader } from "@/components/SiteHeader";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 outline-none sm:px-6 sm:py-14">{children}</main>
      <footer className="mt-10 border-t border-line pb-20 sm:pb-0">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-7 text-[13px] text-faint sm:flex-row sm:px-6">
          <span>World ID proves it&apos;s you. Arkiv remembers. Chainlink CRE decides. Swarm keeps it.</span>
          <span>Encrypted in your browser. Nobody holds your key.</span>
        </div>
      </footer>
    </>
  );
}
