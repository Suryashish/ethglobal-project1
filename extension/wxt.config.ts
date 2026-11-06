import { defineConfig } from "wxt";

// E2E builds (IIGS_E2E=1) additionally match the local fixture (4010) and mock API (3999).
const E2E = process.env.IIGS_E2E === "1";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  zip: { name: "silent-seal" },
  outDir: E2E ? ".output-e2e" : ".output",
  vite: () => ({
    define: {
      "import.meta.env.VITE_IIGS_E2E": JSON.stringify(E2E ? "1" : "0"),
      // Pin the encryption keys into release builds (the e2e build talks to a mock server with throwaway keys).
      "import.meta.env.VITE_IIGS_ESCROW_PUBLIC_KEY": JSON.stringify(E2E ? "" : process.env.IIGS_ESCROW_PUBLIC_KEY ?? ""),
      "import.meta.env.VITE_IIGS_GATED_PUBLIC_KEY": JSON.stringify(E2E ? "" : process.env.IIGS_GATED_PUBLIC_KEY ?? ""),
    },
  }),
  manifest: {
    name: "Silent Seal",
    description: "Seal a post. It opens at a set time unless you disarm it — optionally only for verified readers of chosen countries.",
    version: "0.1.0",
    permissions: ["storage", "scripting", "clipboardWrite"],
    host_permissions: [
      "https://x.com/*",
      "https://twitter.com/*",
      "https://www.reddit.com/*",
      "https://old.reddit.com/*",
      "http://localhost:3000/*",
      ...(E2E ? ["http://localhost:3999/*", "http://localhost:4010/*"] : []),
    ],
    optional_host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
    icons: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png", 128: "icon/128.png" },
    action: { default_title: "Silent Seal", default_icon: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png", 128: "icon/128.png" } },
  },
});
