#!/bin/bash
# CC Gateway Client Setup
# Run this on each client machine to configure Claude Code to use the gateway.
# Client machines NEVER contact Anthropic directly.

set -e

echo "=== CC Gateway Client Setup ==="
echo ""

read -p "Gateway URL (e.g., https://gateway.office.com:8443): " GATEWAY_URL
read -p "Your bearer token: " BEARER_TOKEN

if [[ -z "$GATEWAY_URL" || -z "$BEARER_TOKEN" ]]; then
  echo "Error: Gateway URL and token are required."
  exit 1
fi

# Detect shell config file
if [[ -n "$ZSH_VERSION" ]] || [[ "$SHELL" == */zsh ]]; then
  RC_FILE="$HOME/.zshrc"
elif [[ -n "$BASH_VERSION" ]] || [[ "$SHELL" == */bash ]]; then
  RC_FILE="$HOME/.bashrc"
else
  RC_FILE="$HOME/.profile"
fi

ENV_BLOCK="
# === CC Gateway ===
# Route all Claude Code API traffic through the gateway
export ANTHROPIC_BASE_URL=\"$GATEWAY_URL\"
# Placeholder token - gateway injects the real OAuth token
export CLAUDE_CODE_OAUTH_TOKEN=\"gateway-managed\"
# Gateway proxy auth - your personal access token
export ANTHROPIC_CUSTOM_HEADERS=\"Proxy-Authorization: Bearer $BEARER_TOKEN\"
# === End CC Gateway ==="

echo ""
echo "Will add to: $RC_FILE"
echo ""
echo "Environment variables:"
echo "  ANTHROPIC_BASE_URL=$GATEWAY_URL"
echo "  CLAUDE_CODE_OAUTH_TOKEN=gateway-managed"
echo "  ANTHROPIC_CUSTOM_HEADERS=Proxy-Authorization: Bearer <token>"
echo ""
echo "Effect:"
echo "  - All API traffic routes through gateway (no direct Anthropic contact)"
echo "  - Gateway injects real OAuth token (no browser login needed)"
echo "  - Telemetry is preserved (disabling it is a risk signal)"
echo ""

read -p "Continue? [y/N] " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  sed -i.bak '/# === CC Gateway ===/,/# === End CC Gateway ===/d' "$RC_FILE" 2>/dev/null || true
  echo "$ENV_BLOCK" >> "$RC_FILE"
  echo ""
  echo "Done! Run: source $RC_FILE"
  echo ""
  echo "Then start Claude Code normally: claude"
  echo "(No login needed - gateway handles auth)"
else
  echo "Aborted."
fi
