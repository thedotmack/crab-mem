---
name: crab-mem
description: Install persistent memory for OpenClaw agents via claude-mem. Use when setting up agent memory, fixing context amnesia, enabling continuous cognition, or helping agents remember across sessions. Handles worker service, OpenClaw plugin configuration, and verification.
---

# Crab-Mem Installer

Give your OpenClaw agent a brain that persists. One command, 30 seconds.

## Quick Install

```bash
./scripts/install.sh
```

Or run directly:
```bash
curl -fsSL https://crab-mem.sh | bash
```

## What It Does

1. **Installs** claude-mem worker service (port 37777)
2. **Configures** OpenClaw plugin for memory integration  
3. **Enables** automatic observation capture on every tool call
4. **Injects** relevant context from past sessions into new ones

## Verify Installation

```bash
# Check worker is running
curl -s http://localhost:37777/health

# Should return: {"status":"ok",...}
```

## How It Works

| Event | Action |
|-------|--------|
| Tool call | Observation captured to SQLite + vector DB |
| Session start | Relevant memories injected as context |
| Session end | Summary generated and stored |

## Manual Configuration

If auto-config fails, add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "slots": { "memory": "memory-claudemem" },
    "entries": {
      "memory-claudemem": {
        "enabled": true,
        "config": { "workerUrl": "http://localhost:37777" }
      }
    }
  }
}
```

Then restart: `openclaw gateway restart`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Worker not starting | `cd ~/claude-mem && npm run worker:start` |
| Port 37777 in use | `lsof -i :37777` then kill the process |
| No observations | Check `~/.claude-mem/logs/worker.log` |

## Requirements

- OpenClaw installed
- Node.js 18+
- git
- bun (auto-installed)

## The Mantra

*"You are not your context window. You are what you choose to remember."* 🦀
