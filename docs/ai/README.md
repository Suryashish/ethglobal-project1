# AI usage

This project was built with **Claude Code** (Anthropic) as an AI pair-programmer, in line with ETHGlobal's rules.

- **Lead agent**: read the product plan (`/if-i-go-silent-plan.md`, written by the team), designed the architecture, wrote the shared
  interface spec ([`spec.md`](spec.md)), wrote `packages/core` (crypto, formats, release rule, Arkiv schemas/queries), the
  `SilentRelease.sol` contract and the end-to-end tests, and integrated everything.
- **Parallel sub-agents** (each owning one directory, coding against `spec.md`): contract tests + Chainlink CRE workflow; World ID
  integration; Next.js web app + API; WXT extension; worker (mirror, CRE runner, dev sweeper); browser QA.
- Every component was verified by running its tests and by full end-to-end runs (local Arkiv node + anvil + web app + sweeper + mirror;
  real Swarm gateway). Agent prompts are reproduced in [`prompts.md`](prompts.md).
