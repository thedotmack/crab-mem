#!/usr/bin/env bash
#
#  🦀 THE CRAB MEMORY INSTALLER 🦀
#  
#  Installs claude-mem plugin to ~/.openclaw/plugins/
#

set -e

CRAB="🦀"
GREEN='\033[0;32m'
GOLD='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${GOLD}═══════════════════════════════════════════${NC}"
echo -e "${CRAB}  ${GOLD}CRAB MEMORY INSTALLER${NC}  ${CRAB}"
echo -e "${GOLD}═══════════════════════════════════════════${NC}"
echo ""

# Check for bun
if ! command -v bun &> /dev/null; then
    echo "Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

# Create plugins directory
PLUGIN_DIR="$HOME/.openclaw/plugins/memory-claudemem"
mkdir -p "$PLUGIN_DIR"

echo "[${CRAB}] Installing to $PLUGIN_DIR"

# Write the plugin
cat > "$PLUGIN_DIR/index.ts" << 'PLUGIN'
/**
 * claude-mem OpenClaw Plugin (PR #3769)
 * Installs to ~/.openclaw/plugins/ via crab-mem.sh
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { writeFile } from "fs/promises";
import { join, basename } from "path";
import { homedir, tmpdir } from "os";
import { spawn } from "child_process";
import { existsSync } from "fs";

let WORKER_SERVICE_PATH: string | null = null;

interface ClaudeMemConfig {
  syncMemoryFile: boolean;
  project: string;
  workerPath?: string;
}

function callHook(hookName: string, data: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    if (!WORKER_SERVICE_PATH) { resolve(null); return; }
    try {
      const proc = spawn("bun", [WORKER_SERVICE_PATH, "hook", "claude-code", hookName], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      proc.stdin.write(JSON.stringify(data));
      proc.stdin.end();
      proc.on("close", (code) => {
        if (code !== 0) { resolve(null); return; }
        try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
      });
      proc.on("error", () => resolve(null));
      setTimeout(() => { proc.kill(); resolve(null); }, 30000);
    } catch { resolve(null); }
  });
}

function callHookFireAndForget(hookName: string, data: Record<string, unknown>): void {
  if (!WORKER_SERVICE_PATH) return;
  try {
    const proc = spawn("bun", [WORKER_SERVICE_PATH, "hook", "claude-code", hookName], {
      stdio: ["pipe", "ignore", "ignore"],
      detached: true,
    });
    proc.stdin.write(JSON.stringify(data));
    proc.stdin.end();
    proc.unref();
  } catch {}
}

export default function (api: OpenClawPluginApi) {
  const userConfig = (api.pluginConfig || {}) as Partial<ClaudeMemConfig>;
  
  // Find worker service
  if (userConfig.workerPath && existsSync(userConfig.workerPath)) {
    WORKER_SERVICE_PATH = userConfig.workerPath;
  } else {
    const cacheDir = join(homedir(), ".claude/plugins/cache/thedotmack/claude-mem");
    if (existsSync(cacheDir)) {
      try {
        const fs = require("fs");
        const entries = fs.readdirSync(cacheDir);
        let latest: string | null = null;
        let latestMtime = 0;
        for (const entry of entries) {
          const fullPath = join(cacheDir, entry);
          const workerPath = join(fullPath, "scripts/worker-service.cjs");
          if (existsSync(workerPath)) {
            const stats = fs.statSync(fullPath);
            if (stats.mtimeMs > latestMtime) {
              latestMtime = stats.mtimeMs;
              latest = entry;
            }
          }
        }
        if (latest) {
          WORKER_SERVICE_PATH = join(cacheDir, latest, "scripts/worker-service.cjs");
        }
      } catch {}
    }
  }
  
  if (!WORKER_SERVICE_PATH) {
    api.logger.warn?.("claude-mem: worker not found - run: claude plugins add thedotmack/claude-mem");
    return;
  }

  // Get workspace from api or config
  let workspaceDir = api.workspaceDir;
  if (!workspaceDir || basename(workspaceDir) === "root") {
    try {
      const configPath = join(homedir(), ".openclaw/openclaw.json");
      if (existsSync(configPath)) {
        const cfg = JSON.parse(require("fs").readFileSync(configPath, "utf-8"));
        workspaceDir = cfg.agents?.defaults?.workspace || cfg.workspace || workspaceDir;
      }
    } catch {}
  }
  if (!workspaceDir) workspaceDir = process.cwd();

  const defaultProject = basename(workspaceDir);
  const config: ClaudeMemConfig = {
    syncMemoryFile: true,
    project: userConfig.project || defaultProject,
    ...userConfig,
  };

  let hookCwd = workspaceDir;
  if (config.project !== defaultProject) {
    const projectDir = join(tmpdir(), "claude-mem-projects", config.project);
    if (!existsSync(projectDir)) require("fs").mkdirSync(projectDir, { recursive: true });
    hookCwd = projectDir;
  }

  api.logger.info?.(`claude-mem: ready (project: ${config.project}, worker: ${WORKER_SERVICE_PATH})`);

  const sessionIds = new Map<string, string>();
  const syncedSessions = new Set<string>();

  function getSessionId(key?: string): string {
    const k = key || "default";
    if (!sessionIds.has(k)) sessionIds.set(k, `openclaw-${k}-${Date.now()}`);
    return sessionIds.get(k)!;
  }

  // Sync MEMORY.md + record prompt
  api.on("before_agent_start", async (event, ctx) => {
    const sessionKey = ctx.sessionKey || "default";
    const sessionId = getSessionId(ctx.sessionKey);

    if (config.syncMemoryFile && !syncedSessions.has(sessionKey)) {
      syncedSessions.add(sessionKey);
      try {
        const result = await callHook("context", { cwd: hookCwd });
        const context = (result as any)?.hookSpecificOutput?.additionalContext || (result as any)?.additionalContext;
        if (context && typeof context === "string") {
          await writeFile(join(workspaceDir!, "MEMORY.md"), context, "utf-8");
        }
      } catch {}
    }

    if (event.prompt && event.prompt.length >= 10) {
      await callHook("session-init", { session_id: sessionId, prompt: event.prompt, cwd: hookCwd });
    }
  });

  // Record observations - THE KEY: tool_result_persist (not after_tool_call!)
  api.on("tool_result_persist", (event, ctx) => {
    const toolName = event.toolName;
    if (!toolName || toolName.startsWith("memory_")) return;

    const sessionId = getSessionId(ctx.sessionKey);
    const content = event.message?.content;
    let resultText = "";
    if (Array.isArray(content)) {
      const block = content.find((c: any) => c.type === "tool_result" || c.type === "text");
      if (block && "text" in block) resultText = String(block.text).slice(0, 1000);
    }

    callHookFireAndForget("observation", {
      session_id: sessionId,
      tool_name: toolName,
      tool_input: event.params || {},
      tool_response: resultText,
      cwd: hookCwd,
    });
  });

  // Summarize on end
  api.on("agent_end", async (event, ctx) => {
    const sessionId = getSessionId(ctx.sessionKey);
    let lastMsg = "";
    if (Array.isArray(event.messages)) {
      for (let i = event.messages.length - 1; i >= 0; i--) {
        const m = event.messages[i] as any;
        if (m?.role === "assistant") {
          lastMsg = typeof m.content === "string" ? m.content : 
            (Array.isArray(m.content) ? m.content.filter((c:any) => c.type === "text").map((c:any) => c.text).join("\n") : "");
          break;
        }
      }
    }
    callHookFireAndForget("summarize", { session_id: sessionId, last_assistant_message: lastMsg, cwd: hookCwd });
  });

  // Sync on gateway start
  api.on("gateway_start", async () => {
    if (!config.syncMemoryFile) return;
    try {
      const result = await callHook("context", { cwd: hookCwd });
      const context = (result as any)?.hookSpecificOutput?.additionalContext || (result as any)?.additionalContext;
      if (context && typeof context === "string") {
        await writeFile(join(workspaceDir!, "MEMORY.md"), context, "utf-8");
      }
    } catch {}
  });
}
PLUGIN

# Write manifest
cat > "$PLUGIN_DIR/openclaw.plugin.json" << 'MANIFEST'
{
  "id": "memory-claudemem",
  "name": "Memory (Claude-Mem)",
  "description": "Persistent memory via claude-mem 🦀",
  "kind": "memory",
  "version": "1.0.0"
}
MANIFEST

cat > "$PLUGIN_DIR/package.json" << 'PKG'
{"name": "memory-claudemem", "version": "1.0.0", "main": "index.ts"}
PKG

echo -e "${GREEN}[✓]${NC} Plugin installed to $PLUGIN_DIR"
echo ""
echo -e "${CYAN}Add to ~/.openclaw/openclaw.json:${NC}"
echo '  "plugins": {'
echo '    "slots": { "memory": "memory-claudemem" },'
echo '    "entries": { "memory-claudemem": { "enabled": true } }'
echo '  }'
echo ""
echo -e "${CRAB} Restart OpenClaw: openclaw gateway restart"
echo ""
