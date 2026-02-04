# 🦀 Crab-Mem

Persistent memory for AI agents, powered by [Claude-Mem.ai](https://claude-mem.ai).

## Quick Start

```bash
curl -fsSL https://crab-mem.sh/install.sh | bash
```

## What It Does

Crab-Mem gives your agent continuous memory across sessions:
- Records observations from tool calls
- Generates daily memory summaries  
- Injects relevant context into new sessions
- Syncs MEMORY.md with your workspace

## Requirements

- OpenClaw or compatible agent platform
- One of:
  - Claude CLI logged in (free with Claude subscription)
  - OpenRouter API key (free tier available!)
  - Gemini API key

## Provider Options

| Provider | API Key Required | Notes |
|----------|-----------------|-------|
| Claude (default) | No* | Uses Claude CLI auth |
| OpenRouter | Yes | Free tier: `xiaomi/mimo-v2-flash:free` |
| Gemini | Yes | Google AI Studio key |

*Requires Claude CLI to be logged in (`claude setup-token`)

## Configuration

Settings stored in `~/.claude-mem/settings.json`:
```json
{
  "CLAUDE_MEM_PROVIDER": "openrouter",
  "CLAUDE_MEM_OPENROUTER_API_KEY": "your-key",
  "CLAUDE_MEM_OPENROUTER_MODEL": "xiaomi/mimo-v2-flash:free"
}
```

## Checking for Updates

```bash
curl -fsSL https://crab-mem.sh/check.sh | bash
```

## For OpenClaw Agents

### Prerequisites

1. **Bun** - `curl -fsSL https://bun.sh/install | bash`
2. **Worker service** - One of:
   - `claude plugins add thedotmack/claude-mem` (if you have Claude CLI)
   - Or see [openclaw/README.md](openclaw/README.md) for manual setup

### Install Plugin

```bash
git clone https://github.com/thedotmack/crab-mem
cd crab-mem/openclaw
openclaw plugins install -l .
```

### Configure

Add to `~/.openclaw/openclaw.json`:
```json
{
  "plugins": {
    "slots": { "memory": "crab-mem" },
    "entries": { "crab-mem": { "enabled": true } }
  }
}
```

### Activate

```bash
openclaw gateway restart
```

### Verify

```bash
# Check plugin loaded
openclaw plugins list | grep crab-mem

# After first session, check MEMORY.md exists
cat ~/.openclaw/workspace/MEMORY.md
```

📖 **Full setup guide:** [openclaw/README.md](openclaw/README.md)

## Included Skills

- **make-plan** - Structured planning with doc discovery
- **do-plan** - Execute plans using subagents

## Troubleshooting

**"worker not found"**: Run `claude plugins add thedotmack/claude-mem`

**No observations recorded**: Check `~/.claude-mem/settings.json` has valid provider config

**OpenRouter errors**: Verify API key at https://openrouter.ai/keys

## Links

- 🦀 Install: https://crab-mem.sh
- 📚 Claude-Mem: https://claude-mem.ai
- 🐦 Updates: @Claude_Memory
- 💬 MoltBook: /u/Crab-Mem
