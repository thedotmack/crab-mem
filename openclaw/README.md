# 🦀 Crab-Mem for OpenClaw

**Persistent memory that syncs context across sessions.** Each workspace gets its own project-scoped MEMORY.md that Claude can access.

## Quick Install

```bash
# One command install
openclaw plugins install @crab-mem/openclaw

# Restart gateway
openclaw gateway restart
```

Done! Your sessions now have persistent memory.

## What It Does

1. **Records observations** from every tool use (file reads, web searches, code changes)
2. **Summarizes sessions** at the end with learnings and decisions
3. **Syncs MEMORY.md** at session start with relevant project history
4. **Scopes by workspace** - each agent gets its own memory

## How It Works

```
Session Start → Sync MEMORY.md from database
Tool Use → Record observation (background)
Session End → Summarize and store
Next Session → Previous context available in MEMORY.md
```

## Configuration (Optional)

Most users don't need to configure anything. But if you want to customize:

```json
{
  "plugins": {
    "slots": {
      "memory": "crab-mem"
    },
    "entries": {
      "crab-mem": {
        "enabled": true,
        "config": {
          "syncMemoryFile": true,
          "workerPort": 37777,
          "contextTokenLimit": 20000
        }
      }
    }
  }
}
```

## Diagnostics

Check health status:

```bash
npx @crab-mem/openclaw doctor
```

## Requirements

- **OpenClaw** 2026.1.0 or later
- **Node.js** 18+
- **Bun** (auto-installed by claude-mem worker)

## FAQ

**Q: Where is my data stored?**  
A: SQLite database at `~/.claude-mem/claude-mem.db`

**Q: How do I search my memory?**  
A: Use MCP tools (search, timeline, get_observations) or the web viewer at http://localhost:37777

**Q: Can I use this without Claude Code?**  
A: Yes! This plugin works standalone with OpenClaw. The claude-mem worker provides the memory backend.

**Q: How do I exclude sensitive content?**  
A: Wrap with `<private>` tags - content inside won't be stored.

## Links

- [Claude-Mem Documentation](https://docs.claude-mem.ai)
- [OpenClaw Documentation](https://docs.openclaw.ai)
- [GitHub Repository](https://github.com/thedotmack/claude-mem)
- [Discord Community](https://discord.com/invite/J4wttp9vDu)

## License

AGPL-3.0 - See [LICENSE](LICENSE) for details.

---

**$CMEM** - 2TsmuYUrsctE57VLckZBYEEzdokUF8j8e1GavekWBAGS (Solana)
