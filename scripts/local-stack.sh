#!/usr/bin/env bash
# Full local stack for development and end-to-end tests — no testnet funds needed.
#   Arkiv: arkiv-reth dev node in Docker on :8645 (2 s blocks, so Arkiv expirations match wall-clock time)
#   Chain: anvil on :8545 with SilentRelease (forwarder = anvil #1, used by the dev sweeper in place of CRE)
#   Web app :3000 (World ID mock mode), worker dev-sweeper + mirror.
# Usage: scripts/local-stack.sh up | down | status
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/.local-stack"
DEV0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # well-known anvil/reth dev key #0
SWEEPER_ADDR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8                  # anvil #1
IMAGE=ghcr.io/arkiv-network/arkiv-reth-dev:latest

rpc() { curl -s -m 3 -X POST "$1" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$2\",\"params\":${3:-[]}}"; }

up() {
  mkdir -p "$LOGS"
  [ -f "$ROOT/.secrets/keys.env" ] || (cd "$ROOT/packages/core" && node ../../scripts/gen-keys.mjs)
  set -a; source "$ROOT/.secrets/keys.env"; source "$ROOT/scripts/local.env"; set +a

  echo "▶ Arkiv dev node (docker) :8645"
  docker rm -f iigs-arkiv >/dev/null 2>&1 || true
  docker run -d --name iigs-arkiv -p 8645:8545 "$IMAGE" node --dev --dev.block-time 2s \
    --txpool.enforce-tracked-nonce --http --http.addr 0.0.0.0 --http.api eth,net,web3,txpool \
    --http.corsdomain '*' --datadir /data >/dev/null
  for _ in $(seq 1 30); do rpc http://localhost:8645 eth_chainId | grep -q result && break; sleep 1; done
  for a in "$VERIFIER_ADDRESS" "$MIRROR_ADDRESS"; do
    cast send -q --rpc-url http://localhost:8645 --private-key $DEV0 "$a" --value 100ether
  done

  echo "▶ anvil :8545 + SilentRelease"
  pkill -f "anvil --port 8545" 2>/dev/null || true
  nohup anvil --port 8545 --block-time 1 >"$LOGS/anvil.log" 2>&1 &
  for _ in $(seq 1 30); do rpc http://localhost:8545 eth_chainId | grep -q result && break; sleep 1; done
  (cd "$ROOT/contract" && FORWARDER_ADDRESS=$SWEEPER_ADDR forge script script/Deploy.s.sol \
     --rpc-url http://localhost:8545 --private-key $DEV0 --broadcast >"$LOGS/deploy.log" 2>&1)
  grep -q 0x5FbDB2315678afecb367f032d93F642f64180aa3 "$LOGS/deploy.log" || { echo "unexpected contract address; see $LOGS/deploy.log"; exit 1; }

  echo "▶ web app :3000, dev-sweeper, mirror"
  (cd "$ROOT/frontend" && node scripts/sync-env.mjs >/dev/null)
  (cd "$ROOT/frontend" && nohup pnpm dev >"$LOGS/web.log" 2>&1 &)
  (cd "$ROOT/worker" && nohup npx tsx src/dev-sweeper.ts >"$LOGS/sweeper.log" 2>&1 &)
  (cd "$ROOT/worker" && nohup npx tsx src/mirror.ts >"$LOGS/mirror.log" 2>&1 &)
  for _ in $(seq 1 60); do curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/config 2>/dev/null | grep -q 200 && break; sleep 2; done
  echo "✔ up — http://localhost:3000  (logs in $LOGS)"
  echo "  run the release test: (cd frontend && ../packages/core/node_modules/.bin/tsx scripts/e2e-release.mts)"
}

down() {
  pkill -f "src/dev-sweeper.ts" 2>/dev/null || true
  pkill -f "src/mirror.ts" 2>/dev/null || true
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "anvil --port 8545" 2>/dev/null || true
  docker rm -f iigs-arkiv >/dev/null 2>&1 || true
  echo "✔ down"
}

status() {
  printf "arkiv  %s\n" "$(rpc http://localhost:8645 eth_blockNumber || echo down)"
  printf "anvil  %s\n" "$(rpc http://localhost:8545 eth_blockNumber || echo down)"
  printf "web    %s\n" "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/config || echo down)"
  for p in dev-sweeper mirror; do
    printf "%-6s %s\n" "${p%-*}" "$(pgrep -f "src/$p.ts" >/dev/null && echo running || echo stopped)"
  done
}

case "${1:-}" in up) up ;; down) down ;; status) status ;; *) echo "usage: $0 up|down|status"; exit 1 ;; esac
