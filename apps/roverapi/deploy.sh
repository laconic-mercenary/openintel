#!/usr/bin/env bash
# deploy.sh — build and deploy authapi + roverapi to Azure Functions
#
# Prerequisites:
#   - Azure CLI (az) installed and logged in
#   - Azure Functions Core Tools (func) installed
#
# Usage:
#   ./deploy.sh [--auth-only | --rover-only]

set -euo pipefail

DEPLOY_AUTH=true
DEPLOY_ROVER=true

while [ $# -gt 0 ]; do
  case "$1" in
    --auth-only)  DEPLOY_ROVER=false; shift ;;
    --rover-only) DEPLOY_AUTH=false;  shift ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

AUTH_FUNC_APP="openinteljpe-authapi"
ROVER_FUNC_APP="openinteljpe-roverapi"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v az &>/dev/null; then
  echo "ERROR: Azure CLI (az) not found."
  exit 1
fi

if ! command -v func &>/dev/null; then
  echo "ERROR: Azure Functions Core Tools (func) not found."
  exit 1
fi

if ! az account show &>/dev/null; then
  echo "ERROR: Not logged in to Azure. Run: az login"
  exit 1
fi

if [ "$DEPLOY_AUTH" = true ]; then
  echo "--- Building authapi ---"
  CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -a -installsuffix cgo \
    -o "$SCRIPT_DIR/deploy/authapi/authapi" \
    "$SCRIPT_DIR/cmd/auth"
  echo "Build complete."

  echo "--- Deploying authapi ---"
  (cd "$SCRIPT_DIR/deploy/authapi" && func azure functionapp publish "$AUTH_FUNC_APP" --custom --no-build)
  echo "authapi deployed."
fi

if [ "$DEPLOY_ROVER" = true ]; then
  echo "--- Building roverapi ---"
  CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -a -installsuffix cgo \
    -o "$SCRIPT_DIR/deploy/roverapi/roverapi" \
    "$SCRIPT_DIR/cmd/rover"
  echo "Build complete."

  echo "--- Deploying roverapi ---"
  (cd "$SCRIPT_DIR/deploy/roverapi" && func azure functionapp publish "$ROVER_FUNC_APP" --custom --no-build)
  echo "roverapi deployed."
fi

echo ""
echo "=== Deploy complete ==="
