#!/bin/bash
# Builds the demo image for one relay, serves it from a local container, and
# runs e2e/ against that container AND that relay over the network. No mocks.
#
#   demo/scripts/e2e.sh https://stg-api.koreanproof.com staging
#   demo/scripts/e2e.sh http://localhost:8080 local     # a local kproof-server
#
# Or, against an already deployed page:
#   KPROOF_E2E_DEMO_URL=https://stg-demo.koreanproof.com demo/scripts/e2e.sh https://stg-api.koreanproof.com staging
#
# Docker: when the effective context is Colima, the `colima` context (default
# VM) is used explicitly; the global context is never changed.
set -euo pipefail

API_URL="${1:-}"
ENVIRONMENT="${2:-}"
if [ -z "$API_URL" ] || [ -z "$ENVIRONMENT" ]; then
  echo "Usage: $0 <relay-origin> <local|staging|production>" >&2
  exit 2
fi
DEMO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

DOCKER=(docker)
case "${DOCKER_CONTEXT:-$(docker context show 2>/dev/null || true)}" in
  colima|colima-*) DOCKER=(docker --context colima) ;;
esac

if [ -z "${KPROOF_E2E_DEMO_URL:-}" ]; then
  IMAGE="kproof-demo:e2e"
  "${DOCKER[@]}" build --target runtime -f "$DEMO_DIR/Dockerfile" \
    --build-arg NODE_VERSION="$(tr -d '[:space:]' < "$DEMO_DIR/../.nvmrc")" \
    --build-arg VITE_KPROOF_API_URL="$API_URL" \
    --build-arg VITE_KPROOF_ENV="$ENVIRONMENT" \
    -t "$IMAGE" "$DEMO_DIR/.."
  CONTAINER="$("${DOCKER[@]}" run -d --rm -p 127.0.0.1::8080 "$IMAGE")"
  trap '"${DOCKER[@]}" stop "$CONTAINER" >/dev/null 2>&1 || true' EXIT
  PORT="$("${DOCKER[@]}" port "$CONTAINER" 8080/tcp | head -1 | sed 's/.*://')"
  export KPROOF_E2E_DEMO_URL="http://127.0.0.1:${PORT}"
  for _ in $(seq 1 30); do
    curl -fsS "$KPROOF_E2E_DEMO_URL/healthz" >/dev/null 2>&1 && break
    sleep 1
  done
  curl -fsS "$KPROOF_E2E_DEMO_URL/healthz" >/dev/null
fi

export KPROOF_E2E_API_URL="$API_URL"
cd "$DEMO_DIR"
env -u NODE_OPTIONS npx vitest run -c vitest.config.e2e.ts
