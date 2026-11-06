import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// A newsroom pairing: Newsreader (made for long-form news reading) for headlines and messages,
// IBM Plex Sans for the interface, IBM Plex Mono for ids and countdowns.
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "IF I GO SILENT", template: "%s · IF I GO SILENT" },
  description:
    "A dead-man's switch for journalists and whistleblowers. Sealed evidence and posts open at a set time, or if the author stops checking in.",
};
export const viewport: Viewport = { themeColor: "#f5f0e6", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster
          theme="light"
          position="bottom-right"
          richColors
          closeButton
          mobileOffset={{ bottom: 88 }}
          toastOptions={{
            style: {
              background: "#fbf8f2",
              border: "1px solid #e3dacb",
              borderRadius: 13,
              color: "#1d1b17",
              fontFamily: "var(--font-plex-sans)",
            },
          }}
        />
      </body>
    </html>
  );
}
