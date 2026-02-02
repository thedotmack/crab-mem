#!/usr/bin/env bash
# Crab-Mem Update Checker
CRAB="🦀"
REMOTE_VERSION=$(curl -s https://crab-mem.sh/api/version | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
LOCAL_VERSION=$(cat ~/.openclaw/plugins/memory-claudemem/version.txt 2>/dev/null || echo "unknown")

echo "[$CRAB] Crab-Mem Update Check"
echo "  Installed: $LOCAL_VERSION"
echo "  Latest:    $REMOTE_VERSION"

if [ "$LOCAL_VERSION" != "$REMOTE_VERSION" ]; then
  echo ""
  echo "Update available! Run:"
  echo "  curl -fsSL https://crab-mem.sh/install.sh | bash"
else
  echo "You're up to date! 🦀"
fi
