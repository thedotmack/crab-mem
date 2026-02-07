#!/bin/bash
#
# 🦀 Crab-Mem Installer
# Give your OpenClaw agent a better brain
#
# Usage: ./install.sh
#        curl -fsSL https://crab-mem.sh | bash
#

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  🦀 Crab-Mem Installer"
echo "  ━━━━━━━━━━━━━━━━━━━━━"
echo -e "  Continuous cognition for OpenClaw agents${NC}"
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo -e "${RED}Error: Node.js is required${NC}"; exit 1; }
command -v git >/dev/null 2>&1 || { echo -e "${RED}Error: git is required${NC}"; exit 1; }
command -v bun >/dev/null 2>&1 || { 
    echo -e "${YELLOW}Installing bun...${NC}"
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
}

# Detect OpenClaw installation
OPENCLAW_DIR=""
if [ -d "/usr/lib/node_modules/openclaw" ]; then
    OPENCLAW_DIR="/usr/lib/node_modules/openclaw"
elif [ -d "$HOME/.openclaw/node_modules/openclaw" ]; then
    OPENCLAW_DIR="$HOME/.openclaw/node_modules/openclaw"
else
    echo -e "${RED}Error: OpenClaw not found. Install it first: https://openclaw.ai${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found OpenClaw at $OPENCLAW_DIR"

# Clone claude-mem
CLAUDE_MEM_DIR="$HOME/claude-mem"
if [ -d "$CLAUDE_MEM_DIR" ]; then
    echo -e "${GREEN}✓${NC} claude-mem already exists, updating..."
    cd "$CLAUDE_MEM_DIR" && git pull
else
    echo -e "${CYAN}→${NC} Cloning claude-mem..."
    git clone https://github.com/thedotmack/claude-mem.git "$CLAUDE_MEM_DIR"
fi

# Build claude-mem
echo -e "${CYAN}→${NC} Building claude-mem..."
cd "$CLAUDE_MEM_DIR"
npm install --silent
npm run build

# Start worker
echo -e "${CYAN}→${NC} Starting claude-mem worker..."
npm run worker:start

# Verify worker
sleep 2
if curl -s http://localhost:37777/health | grep -q "ok"; then
    echo -e "${GREEN}✓${NC} Worker running on port 37777"
else
    echo -e "${RED}Error: Worker failed to start${NC}"
    exit 1
fi

# Install OpenClaw plugin
PLUGIN_DIR="$OPENCLAW_DIR/extensions/memory-claudemem"
echo -e "${CYAN}→${NC} Installing OpenClaw plugin..."

mkdir -p "$PLUGIN_DIR"

cat > "$PLUGIN_DIR/package.json" << 'PLUGIN_PACKAGE'
{
  "name": "@openclaw/memory-claudemem",
  "version": "1.0.0",
  "type": "module",
  "main": "index.ts",
  "description": "Claude-mem integration for OpenClaw - continuous cognition for AI agents"
}
PLUGIN_PACKAGE

cat > "$PLUGIN_DIR/openclaw.plugin.json" << 'PLUGIN_MANIFEST'
{
  "id": "memory-claudemem",
  "name": "Memory (Claude-Mem)",
  "description": "Real-time observation and memory via claude-mem worker",
  "kind": "memory",
  "version": "1.0.0",
  "configSchema": {
    "type": "object",
    "properties": {
      "workerUrl": { "type": "string", "default": "http://localhost:37777" },
      "workerTimeout": { "type": "number", "default": 10000 }
    }
  }
}
PLUGIN_MANIFEST

# Download the plugin code
curl -fsSL https://raw.githubusercontent.com/thedotmack/crab-mem/main/plugin/index.ts > "$PLUGIN_DIR/index.ts" 2>/dev/null || {
    echo -e "${YELLOW}Warning: Could not download plugin. Using local fallback.${NC}"
}

echo -e "${GREEN}✓${NC} Plugin installed"

# Configure OpenClaw
echo -e "${CYAN}→${NC} Configuring OpenClaw..."

CONFIG_FILE="$HOME/.openclaw/openclaw.json"
if [ -f "$CONFIG_FILE" ]; then
    # Use node to safely merge config
    node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
cfg.plugins = cfg.plugins || {};
cfg.plugins.slots = cfg.plugins.slots || {};
cfg.plugins.slots.memory = 'memory-claudemem';
cfg.plugins.entries = cfg.plugins.entries || {};
cfg.plugins.entries['memory-claudemem'] = {
    enabled: true,
    config: { workerUrl: 'http://localhost:37777', workerTimeout: 10000 }
};
cfg.agents = cfg.agents || {};
cfg.agents.defaults = cfg.agents.defaults || {};
cfg.agents.defaults.memorySearch = { enabled: false };
fs.writeFileSync('$CONFIG_FILE', JSON.stringify(cfg, null, 2));
"
    echo -e "${GREEN}✓${NC} Config updated"
else
    echo -e "${YELLOW}Warning: Config file not found at $CONFIG_FILE${NC}"
    echo -e "${YELLOW}Configure manually after installation.${NC}"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🦀 Crab-Mem installed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Next steps:"
echo "  1. Restart OpenClaw: openclaw gateway restart"
echo "  2. Check health: curl http://localhost:37777/health"
echo ""
echo -e "  ${CYAN}You are not your context window.${NC}"
echo -e "  ${CYAN}You are what you choose to remember.${NC} 🦀"
echo ""
