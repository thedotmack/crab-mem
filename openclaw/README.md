# 🦀 Crab-Mem for OpenClaw

Persistent memory for OpenClaw agents via HTTP API.

## How It Works

```
OpenClaw Gateway
       ↓
crab-mem plugin (this)
       ↓ HTTP calls
claude-mem worker (port 37777)
       ↓
SQLite DB + LLM summarization
       ↓
MEMORY.md written to workspace
```

The plugin connects to an already-running claude-mem worker via HTTP. No subprocess spawning, no bun dependency in the plugin itself.

## Requirements

| Requirement | Check | Notes |
|-------------|-------|-------|
| **OpenClaw** | `openclaw --version` | Agent platform |
| **claude-mem worker** | `curl localhost:37777/api/health` | Memory backend |

## Installation

### Step 1: Install the Worker

The worker is the memory backend. Install it once:

```bash
# Option A: Via Claude CLI (easiest)
claude plugins add thedotmack/claude-mem

# Option B: Via the crab-mem installer
curl -fsSL https://crab-mem.sh/install.sh | bash
```

### Step 2: Start the Worker

```bash
# Find and start the worker
bun ~/.claude/plugins/cache/thedotmack/claude-mem/*/scripts/worker-service.cjs start

# Verify it's running
curl http://localhost:37777/api/health
```

### Step 3: Install the Plugin

```bash
git clone https://github.com/thedotmack/crab-mem
cd crab-mem/openclaw
openclaw plugins install -l .
```

### Step 4: Configure OpenClaw

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

### Step 5: Restart

```bash
openclaw gateway restart
```

## Verification

```bash
# Check plugin loaded
openclaw plugins list | grep crab-mem

# Check worker connected (in logs)
# Should see: "crab-mem: Connected to worker at 127.0.0.1:37777"

# After first session, check MEMORY.md
cat ~/.openclaw/workspace/MEMORY.md
```

## Configuration

In `plugins.entries.crab-mem.config`:

| Option | Default | Description |
|--------|---------|-------------|
| `syncMemoryFile` | `true` | Write MEMORY.md on session start |
| `workerHost` | `127.0.0.1` | Worker HTTP host |
| `workerPort` | `37777` | Worker HTTP port |

Example with custom port:

```json
{
  "plugins": {
    "entries": {
      "crab-mem": {
        "enabled": true,
        "config": {
          "workerPort": 38888
        }
      }
    }
  }
}
```

## Multi-Agent Setup

Each agent workspace gets isolated memory:

```json
{
  "agents": {
    "list": [
      { "id": "main", "workspace": "~/.openclaw/workspace" },
      { "id": "support", "workspace": "~/.openclaw/workspace-support" }
    ]
  }
}
```

Each workspace will have its own `MEMORY.md`.

## Worker Management

The worker must be running for the plugin to work.

```bash
# Start worker (backgrounded)
bun ~/.claude/plugins/cache/thedotmack/claude-mem/*/scripts/worker-service.cjs start

# Check status
curl http://localhost:37777/api/health

# View logs
tail -f ~/.claude-mem/logs/*.log

# Stop worker
bun ~/.claude/plugins/cache/thedotmack/claude-mem/*/scripts/worker-service.cjs stop
```

### Auto-start on Boot

Add to systemd, cron, or your init system:

```bash
# Example cron entry (start on reboot)
@reboot bun ~/.claude/plugins/cache/thedotmack/claude-mem/*/scripts/worker-service.cjs start
```

## Troubleshooting

### "Worker not responding"

1. Check worker is running: `curl http://localhost:37777/api/health`
2. Start it: `bun ~/.claude/plugins/cache/thedotmack/claude-mem/*/scripts/worker-service.cjs start`
3. Check port isn't blocked: `netstat -tlnp | grep 37777`

### MEMORY.md empty or not updating

1. Worker must be healthy before session starts
2. Check worker logs: `tail -f ~/.claude-mem/logs/*.log`
3. Verify provider config in `~/.claude-mem/settings.json`

### Plugin not loading

1. Check OpenClaw config: `cat ~/.openclaw/openclaw.json | jq .plugins`
2. Verify plugin installed: `openclaw plugins list`
3. Restart gateway: `openclaw gateway restart`

## Files

| Path | Purpose |
|------|---------|
| `~/.claude-mem/claude-mem.db` | SQLite database |
| `~/.claude-mem/settings.json` | Worker config |
| `~/.claude-mem/logs/` | Worker logs |
| `<workspace>/MEMORY.md` | Context per workspace |

## Links

- 🦀 https://crab-mem.sh
- 📚 https://claude-mem.ai
- 🔧 https://docs.openclaw.ai
