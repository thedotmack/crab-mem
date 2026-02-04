# 🦀 Crab-Mem for OpenClaw

Persistent memory for OpenClaw agents. Each workspace gets project-scoped context that persists across sessions.

## System Flow

```
Message → OpenClaw Gateway → crab-mem plugin
                                  ↓
                        spawns worker-service.cjs (via bun)
                                  ↓
                        worker queries SQLite DB
                        calls LLM for summarization
                                  ↓
                        writes MEMORY.md to workspace
```

## Prerequisites

| Requirement | Check | Install |
|-------------|-------|---------|
| **Node.js 18+** | `node --version` | [nodejs.org](https://nodejs.org) |
| **Bun** | `bun --version` | `curl -fsSL https://bun.sh/install \| bash` |
| **OpenClaw** | `openclaw --version` | [docs.openclaw.ai](https://docs.openclaw.ai) |

## Installation

### Option 1: With Claude CLI (Interactive)

If you have Claude CLI installed and authenticated:

```bash
# Install the worker (provides memory backend)
claude plugins add thedotmack/claude-mem

# Install the OpenClaw plugin
git clone https://github.com/thedotmack/crab-mem
cd crab-mem/openclaw
openclaw plugins install -l .

# Configure OpenClaw
# Add to ~/.openclaw/openclaw.json under "plugins":
#   "slots": { "memory": "crab-mem" }

# Restart
openclaw gateway restart
```

### Option 2: Without Claude CLI (Headless Servers)

For bots running on servers without Claude CLI:

**Step 1: Install Bun**
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc  # or restart shell
```

**Step 2: Get the worker-service**

The worker is bundled in the claude-mem npm package:
```bash
# Create cache directory
mkdir -p ~/.claude/plugins/cache/thedotmack/claude-mem/latest/scripts

# Download worker (from npm package)
cd ~/.claude/plugins/cache/thedotmack/claude-mem/latest
npm pack thedotmack/claude-mem --pack-destination .
tar -xzf claude-mem-*.tgz --strip-components=1
rm claude-mem-*.tgz
```

Or copy from an existing installation:
```bash
# If you have it installed elsewhere, copy the scripts directory
cp -r /path/to/claude-mem/scripts ~/.claude/plugins/cache/thedotmack/claude-mem/latest/
```

**Step 3: Configure Provider**

Create `~/.claude-mem/settings.json`:

```json
{
  "CLAUDE_MEM_PROVIDER": "openrouter",
  "CLAUDE_MEM_OPENROUTER_API_KEY": "sk-or-v1-your-key-here",
  "CLAUDE_MEM_OPENROUTER_MODEL": "xiaomi/mimo-v2-flash:free",
  "CLAUDE_MEM_DATA_DIR": "/root/.claude-mem",
  "CLAUDE_MEM_LOG_LEVEL": "INFO"
}
```

Provider options:
- `openrouter` - Free tier available at [openrouter.ai/keys](https://openrouter.ai/keys)
- `gemini` - Requires `CLAUDE_MEM_GEMINI_API_KEY`
- `claude` - Requires Claude CLI auth or `ANTHROPIC_API_KEY`

**Step 4: Install OpenClaw Plugin**
```bash
git clone https://github.com/thedotmack/crab-mem
cd crab-mem/openclaw
openclaw plugins install -l .
```

**Step 5: Configure OpenClaw**

Add to `~/.openclaw/openclaw.json`:
```json
{
  "plugins": {
    "slots": {
      "memory": "crab-mem"
    },
    "entries": {
      "crab-mem": {
        "enabled": true
      }
    }
  }
}
```

**Step 6: Restart**
```bash
openclaw gateway restart
```

## Verification

```bash
# Check plugin loaded
openclaw plugins list | grep crab-mem

# Check worker found (in gateway logs)
journalctl -u openclaw -n 50 | grep crab-mem
# Should see: "crab-mem: Ready (N workspaces, worker: worker-service.cjs)"

# Check database created
ls -la ~/.claude-mem/claude-mem.db

# Check MEMORY.md synced (after first session)
cat ~/.openclaw/workspace/MEMORY.md
```

## Configuration Options

In `~/.openclaw/openclaw.json` under `plugins.entries.crab-mem.config`:

| Option | Default | Description |
|--------|---------|-------------|
| `syncMemoryFile` | `true` | Write MEMORY.md to workspace on session start |
| `workerPort` | `37777` | Port for worker HTTP API |
| `workerPath` | auto | Custom path to worker-service.cjs |

Example:
```json
{
  "plugins": {
    "entries": {
      "crab-mem": {
        "enabled": true,
        "config": {
          "syncMemoryFile": true,
          "workerPath": "/custom/path/to/worker-service.cjs"
        }
      }
    }
  }
}
```

## Multi-Agent Setup

Each agent gets its own memory scoped to its workspace:

```json
{
  "agents": {
    "list": [
      { "id": "main", "workspace": "/root/.openclaw/workspace" },
      { "id": "dev", "workspace": "/root/.openclaw/workspace-dev" },
      { "id": "support", "workspace": "/root/.openclaw/workspace-support" }
    ]
  }
}
```

Each workspace will have its own `MEMORY.md` with project-specific context.

## Troubleshooting

### "Worker service not found"

The plugin can't find `worker-service.cjs`. Check:
```bash
# Should exist in one of these locations:
ls ~/.claude/plugins/cache/thedotmack/claude-mem/*/scripts/worker-service.cjs
ls ~/.claude/plugins/marketplaces/thedotmack/plugin/scripts/worker-service.cjs
```

If missing, install via Claude CLI or manually (see Option 2 above).

### "bun: command not found"

Install Bun:
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### MEMORY.md not updating

1. Check worker is running: `curl http://localhost:37777/api/health`
2. Check logs: `tail -f ~/.claude-mem/logs/*.log`
3. Verify provider config in `~/.claude-mem/settings.json`

### Database errors

```bash
# Check database exists and is writable
ls -la ~/.claude-mem/claude-mem.db
# Should be > 0 bytes after first session
```

## Files

| Path | Purpose |
|------|---------|
| `~/.claude-mem/claude-mem.db` | SQLite database (observations, summaries) |
| `~/.claude-mem/settings.json` | Provider and worker config |
| `~/.claude-mem/logs/` | Worker logs |
| `<workspace>/MEMORY.md` | Context file synced to each workspace |

## Links

- 🦀 Crab-Mem: https://crab-mem.sh
- 📚 Claude-Mem: https://claude-mem.ai
- 🔧 OpenClaw: https://docs.openclaw.ai
- 💬 Discord: https://discord.com/invite/J4wttp9vDu
