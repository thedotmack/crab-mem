# Plan: Official OpenClaw Plugin for Claude-Mem + Observation Feed

## Goal
1. Move the OpenClaw plugin from `crab-mem` repo INTO `claude-mem` repo as an official first-party plugin
2. Add live observation feed: when worker records an observation, immediately send it to any configured OpenClaw channel

## Architecture

### Current State
- `crab-mem` repo (`/Projects/crab-mem/openclaw/`) has a prototype OpenClaw plugin
- `claude-mem` repo has `plugin/` (Claude Code MCP plugin) but no OpenClaw plugin
- Worker already SSE-broadcasts `new_observation` events on `GET /stream` (port 37777)

### Target State
- `claude-mem/openclaw/` — new directory in claude-mem repo containing the official OpenClaw plugin
- Plugin subscribes to worker SSE stream and forwards observations to configured channels
- Channel-agnostic: works with Telegram, Discord, Signal, Slack, etc.

---

## Phase 1: Create plugin directory in claude-mem

### Files to create in `claude-mem/openclaw/`:

**`openclaw.plugin.json`**
```json
{
  "id": "claude-mem",
  "name": "Claude-Mem (Persistent Memory)",
  "description": "Official OpenClaw plugin for Claude-Mem. Persistent memory across sessions with live observation feed. 🧠",
  "kind": "memory",
  "version": "1.0.0",
  "author": "thedotmack",
  "homepage": "https://claude-mem.com",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "syncMemoryFile": {
        "type": "boolean",
        "default": true,
        "description": "Automatically sync MEMORY.md on session start"
      },
      "workerPort": {
        "type": "number",
        "default": 37777,
        "description": "Port for Claude-Mem worker service"
      },
      "workerPath": {
        "type": "string",
        "description": "Custom path to worker-service.cjs (auto-detected if not set)"
      },
      "observationFeed": {
        "type": "object",
        "description": "Live observation feed — streams observations to any OpenClaw channel in real-time",
        "properties": {
          "enabled": {
            "type": "boolean",
            "default": false,
            "description": "Enable live observation feed to messaging channels"
          },
          "channel": {
            "type": "string",
            "description": "Channel type: telegram, discord, signal, slack, whatsapp, line"
          },
          "to": {
            "type": "string",
            "description": "Target chat/user ID to send observations to"
          }
        }
      }
    }
  }
}
```

**`src/index.ts`** — Full plugin source (details in Phase 2)

**`package.json`** — Minimal, for TypeScript compilation
```json
{
  "name": "@claude-mem/openclaw-plugin",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

**`tsconfig.json`**

### Verification
- [ ] `openclaw.plugin.json` has valid schema with `observationFeed` config
- [ ] Plugin ID is `claude-mem`
- [ ] All branding references Claude-Mem (not crab-mem)
- [ ] TypeScript compiles cleanly

---

## Phase 2: Implement observation feed in `src/index.ts`

### Design
The plugin has two responsibilities:
1. **Memory sync** (existing) — sync MEMORY.md on session start, record observations/summaries via CLI hooks
2. **Observation feed** (new) — SSE consumer service that forwards observations to any OpenClaw channel

### SSE Consumer Service
Register via `api.registerService()`:

```typescript
api.registerService({
  id: "claude-mem-observation-feed",
  start: async (ctx) => {
    // Connect to worker SSE endpoint: http://localhost:{port}/stream
    // Parse SSE events, filter for type === "new_observation"
    // Send observation title + subtitle to configured channel
  },
  stop: async (ctx) => {
    // Close SSE connection
  }
});
```

### SSE Connection Details
- **Endpoint**: `GET http://localhost:{workerPort}/stream`
- **Content-Type**: `text/event-stream`
- **Event format**: `data: {"type":"new_observation","observation":{"id":...,"title":"...","subtitle":"...","type":"...","project":"..."}}\n\n`
- Use native `fetch()` with streaming response body (Node 18+ ReadableStream)
- Auto-reconnect on disconnect with exponential backoff

### Channel Send Logic
The send function maps channel name to the correct runtime function:

```typescript
function sendToChannel(api: OpenClawPluginApi, channel: string, to: string, text: string) {
  const channelMap: Record<string, (to: string, text: string) => Promise<any>> = {
    telegram: api.runtime.channel.telegram.sendMessageTelegram,
    discord: api.runtime.channel.discord.sendMessageDiscord,
    signal: api.runtime.channel.signal.sendMessageSignal,
    slack: api.runtime.channel.slack.sendMessageSlack,
    whatsapp: api.runtime.channel.whatsapp.sendMessageWhatsApp,
    line: api.runtime.channel.line.sendMessageLine,
  };
  const sender = channelMap[channel];
  if (sender) return sender(to, text);
}
```

### Message Format
```
🧠 Claude-Mem Observation
**{title}**
{subtitle}
```

### `/claude-mem-feed` Command
Register via `api.registerCommand()`:
- `/claude-mem-feed` — show current feed status (enabled/disabled, channel, target)
- Toggleable: `/claude-mem-feed on` / `/claude-mem-feed off`

### Verification
- [ ] SSE connection establishes to worker `/stream` endpoint
- [ ] `new_observation` events are parsed correctly
- [ ] Messages arrive in configured channel immediately
- [ ] SSE reconnects on disconnect
- [ ] `/claude-mem-feed` command works
- [ ] No batching/buffering — each observation sent individually

---

## Phase 3: Wire up and test

1. Install the plugin from the `openclaw/` directory in the claude-mem repo
2. Update `~/.openclaw/openclaw.json` plugin config:
   ```json
   {
     "plugins": {
       "entries": {
         "claude-mem": {
           "enabled": true,
           "source": "<path-to-claude-mem>/openclaw",
           "config": {
             "observationFeed": {
               "enabled": true,
               "channel": "telegram",
               "to": "5628130545"
             }
           }
         }
       }
     }
   }
   ```
3. Restart OpenClaw gateway
4. Verify worker health: `curl http://localhost:37777/health`
5. Trigger an observation (start a Claude session with claude-mem enabled)
6. Confirm message arrives in configured channel

### Verification
- [ ] Gateway starts without errors
- [ ] Plugin logs show SSE connection established
- [ ] Observation triggers channel message
- [ ] Message contains title + subtitle with Claude-Mem branding
- [ ] No duplicate messages
- [ ] Feed survives worker restart (reconnect)

---

## Phase 4: PR to claude-mem repo

1. Create branch `feat/openclaw-plugin`
2. Add `openclaw/` directory with all files
3. Update root README mentioning OpenClaw plugin support
4. Open PR: "Official OpenClaw plugin for Claude-Mem"
5. Release notes: "Claude-Mem now ships with an official OpenClaw plugin — get live observation feeds in Telegram, Discord, Signal, Slack, and more"

---

## Key Decisions
- **Plugin ID**: `claude-mem` — official branding, lives in the claude-mem repo
- **Command name**: `/claude-mem-feed` — branded to Claude-Mem
- **SSE over webhook**: Worker already broadcasts, just subscribe — no upstream changes needed
- **No batching**: Each observation sent immediately as it arrives
- **Channel-agnostic**: Config-driven channel selection via OpenClaw runtime, not hardcoded to any provider
- **Native fetch for SSE**: No EventSource polyfill needed, Node 18+ streaming fetch works
- **Reconnect**: Exponential backoff (1s → 2s → 4s → ... → 30s max)
