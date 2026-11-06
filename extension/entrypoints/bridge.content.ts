import { browser } from "wxt/browser";
import { isSealId } from "@iigs/core";

const E2E = import.meta.env.VITE_IIGS_E2E === "1";

export default defineContentScript({
  matches: ["http://localhost:3000/*", ...(E2E ? ["http://localhost:3999/*"] : [])],
  runAt: "document_start",
  main() {
    document.documentElement.setAttribute("data-iigs-extension", "1");
    window.addEventListener("message", (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window) return;
      const d = event.data;
      if (!d || typeof d !== "object" || d.source !== "iigs-web") return;
      if (d.type === "IIGS_ARMED" && isSealId(d.sealId) && typeof d.post === "string") {
        void browser.runtime.sendMessage({
          type: "armed",
          sealId: d.sealId,
          ownerNullifier: typeof d.ownerNullifier === "string" ? d.ownerNullifier : undefined,
          post: d.post,
        });
      } else if (d.type === "IIGS_READER_TOKEN" && typeof d.token === "string") {
        void browser.runtime.sendMessage({
          type: "reader-token",
          token: d.token,
          nationality: String(d.nationality ?? ""),
          expiresAt: Number(d.expiresAt),
        });
      }
    });
  },
});
