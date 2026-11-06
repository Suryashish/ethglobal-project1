# Silent Seal (browser extension)

MV3 extension (WXT + React + TypeScript) for **IF I GO SILENT**: seal a post on your device, arm it with a World ID
face check, paste it into X / Reddit, and let readers see live status cards (and the decrypted text once it opens).
Plaintext never leaves the device: encryption happens in the popup with `@iigs/core`; the web app only receives ciphertext and a wrapped key.

## Build / load

```sh
pnpm install
pnpm --filter @iigs/extension build      # → extension/.output/chrome-mv3
pnpm --filter @iigs/extension dev        # live-reload dev build/browser
pnpm --filter @iigs/extension zip        # → extension/.output/silent-seal-0.1.0-chrome.zip
```

Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/.output/chrome-mv3`.
(Branded Chrome 137+ ignores `--load-extension`; use the UI, or Chrome for Testing / Chromium for automation.)

## Configure

Popup → **Settings** → web app URL (default `http://localhost:3000`, which is covered by the manifest).
For a deployed URL, Save asks for permission to that origin (optional host permission) and registers the bridge
content script there dynamically. The web app must serve `/api/config`, `/api/seals/state`, `/api/reader/key`,
`/arm` and `/verify-reader` (see `docs/ai/spec.md`).

## Flow: compose → arm → post

1. Popup → write text, pick **Opens in** (2 min, 5 min, 1 hour, 1 day, 5 days or a custom date/time). Optional:
   "also open early if I go silent for …" (heartbeat → rule BOTH) and countries (🇮🇳 IN …) for a country-gated seal.
2. **Seal** fetches `/api/config` (escrow + gated public keys), encrypts on-device (`createSeal`, inline only; too long → error),
   and opens `${baseUrl}/arm#d=<base64url(draft)>`. The originating tab id and the draft are kept in `chrome.storage.local`.
3. In that tab, do the World ID face check. The page posts `IIGS_ARMED {sealId, ownerNullifier, post}`; the bridge content
   script forwards it, the background saves it under **My sealed posts**, re-focuses the original tab and inserts the sealed
   post into the focused composer (`execCommand('insertText')`; clipboard + toast fallback). Popup → **Insert into current page**
   re-inserts any saved post; **Copy sealed text** copies it.
4. Post it. Anyone with the extension sees a card under the post:
   🔒 Sealed · opens in 3d 4h · ✅ sealed by a verified human → 🚫 Cancelled / ⏳ releasing / 🔓 decrypted text in place.

## Flow: reader of a country-gated post

The card shows "🌍 Visible to verified readers from IN" + **Verify nationality** (also in the popup) → `${baseUrl}/verify-reader`
→ the page posts `IIGS_READER_TOKEN`, stored in `chrome.storage.local`. After release the extension calls `POST /api/reader/key`
and decrypts in place, or shows "Not available in your country" (403 `not_in_country`).

## Tests

```sh
pnpm --filter @iigs/extension compile    # tsc
pnpm --filter @iigs/extension test       # vitest unit tests (happy-dom)
pnpm --filter @iigs/extension test:e2e   # builds with IIGS_E2E=1 and drives Chrome for Testing (mock API :3999, fixture :4010)
```

The E2E build additionally matches `http://localhost:4010` (fixture timeline) and `http://localhost:3999` (mock API/bridge);
the production manifest does not. It uses a Chrome for Testing build from the Playwright cache (`~/Library/Caches/ms-playwright`).

## Layout

`entrypoints/background.ts` (network, storage, tab orchestration) · `entrypoints/social.content.ts` (scan, cards, composer insert) ·
`entrypoints/bridge.content.ts` (web app ↔ extension) · `entrypoints/popup/` · `lib/` (pure logic, unit-tested) · `scripts/gen-icons.mjs`.
Not built: generic any-site mode (E6), Swarm upload for long posts / images (E8).
