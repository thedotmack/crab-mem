/**
 * Crab-Mem OpenClaw Plugin
 * 
 * Persistent memory across sessions via claude-mem worker CLI hooks.
 * Each workspace gets its own project-scoped context.
 * 
 * @author thedotmack
 * @license AGPL-3.0
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { writeFile } from "fs/promises";
import { join, basename } from "path";
import { homedir } from "os";
import { spawn } from "child_process";
import { existsSync, readFileSync, mkdirSync, readdirSync, statSync } from "fs";

// ============================================================================
// Types
// ============================================================================

let WORKER_SERVICE_PATH: string | null = null;

interface CrabMemConfig {
  syncMemoryFile: boolean;
  project: string;
  workerPath?: string;
}

// ============================================================================
// Worker CLI Interface (NOT HTTP - CLI has full parity)
// ============================================================================

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

// ============================================================================
// Worker Discovery
// ============================================================================

function findWorkerService(userPath?: string): string | null {
  // 1. User-specified path
  if (userPath && existsSync(userPath)) {
    return userPath;
  }

  // 2. Standard claude plugins cache
  const cacheDir = join(homedir(), ".claude/plugins/cache/thedotmack/claude-mem");
  if (existsSync(cacheDir)) {
    try {
      const entries = readdirSync(cacheDir);
      let latest: string | null = null;
      let latestMtime = 0;
      for (const entry of entries) {
        const fullPath = join(cacheDir, entry);
        const workerPath = join(fullPath, "scripts/worker-service.cjs");
        if (existsSync(workerPath)) {
          const stats = statSync(fullPath);
          if (stats.mtimeMs > latestMtime) {
            latestMtime = stats.mtimeMs;
            latest = entry;
          }
        }
      }
      if (latest) {
        return join(cacheDir, latest, "scripts/worker-service.cjs");
      }
    } catch {}
  }

  // 3. Marketplace install location
  const marketplacePath = join(homedir(), ".claude/plugins/marketplaces/thedotmack/scripts/worker-service.cjs");
  if (existsSync(marketplacePath)) {
    return marketplacePath;
  }

  // 4. Local dev paths
  const devPaths = [
    join(homedir(), "Projects/claude-mem/scripts/worker-service.cjs"),
    join(homedir(), "claude-mem/scripts/worker-service.cjs"),
    "/Projects/claude-mem/scripts/worker-service.cjs",
  ];
  for (const p of devPaths) {
    if (existsSync(p)) return p;
  }

  return null;
}

// ============================================================================
// Workspace Management
// ============================================================================

function loadAgentWorkspaces(): Map<string, string> {
  const workspaces = new Map<string, string>();

  try {
    const configPath = join(homedir(), ".openclaw/openclaw.json");
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
      const defaultWs =
        cfg.agents?.defaults?.workspace || join(homedir(), ".openclaw/workspace");

      const agents = cfg.agents?.list || [];
      for (const agent of agents) {
        const ws = agent.workspace || defaultWs;
        workspaces.set(agent.id, ws);
      }

      if (!workspaces.has("default")) workspaces.set("default", defaultWs);
      if (!workspaces.has("main")) workspaces.set("main", defaultWs);
    }
  } catch {
    workspaces.set("default", join(homedir(), ".openclaw/workspace"));
  }

  return workspaces;
}

function extractAgentId(sessionKey?: string): string {
  if (!sessionKey) return "main";
  return sessionKey.split(":")[0] || "main";
}

// ============================================================================
// Plugin Registration
// ============================================================================

export const id = "crab-mem";
export const name = "Crab-Mem (Persistent Memory)";

export default function register(api: OpenClawPluginApi) {
  const userConfig = (api.pluginConfig || {}) as Partial<CrabMemConfig>;

  // Find worker service
  WORKER_SERVICE_PATH = findWorkerService(userConfig.workerPath);
  
  if (!WORKER_SERVICE_PATH) {
    api.logger.warn?.(
      "crab-mem: worker not found - install claude-mem first: " +
      "claude plugins add thedotmack/claude-mem"
    );
    return;
  }

  const agentWorkspaces = loadAgentWorkspaces();

  const config: CrabMemConfig = {
    syncMemoryFile: userConfig.syncMemoryFile ?? true,
    project: userConfig.project || "openclaw",
    ...userConfig,
  };

  api.logger.info?.(
    `crab-mem: ready (${agentWorkspaces.size} workspaces, worker: ${WORKER_SERVICE_PATH})`
  );

  // Session tracking
  const sessionIds = new Map<string, string>();
  const syncedSessions = new Set<string>();

  function getSessionId(key?: string): string {
    const k = key || "default";
    if (!sessionIds.has(k)) {
      sessionIds.set(k, `openclaw-${k}-${Date.now()}`);
    }
    return sessionIds.get(k)!;
  }

  function getWorkspaceForSession(sessionKey?: string): string {
    const agentId = extractAgentId(sessionKey);
    return (
      agentWorkspaces.get(agentId) ||
      agentWorkspaces.get("main") ||
      join(homedir(), ".openclaw/workspace")
    );
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Before agent starts: Sync MEMORY.md and record prompt
   */
  api.on("before_agent_start", async (event, ctx) => {
    const sessionKey = ctx.sessionKey || "default";
    const sessionId = getSessionId(ctx.sessionKey);
    const workspaceDir = getWorkspaceForSession(ctx.sessionKey);
    const projectName = basename(workspaceDir);

    // Sync MEMORY.md once per session
    if (config.syncMemoryFile && !syncedSessions.has(sessionKey)) {
      syncedSessions.add(sessionKey);

      try {
        const result = await callHook("context", { cwd: workspaceDir });
        const context =
          (result as any)?.hookSpecificOutput?.additionalContext ||
          (result as any)?.additionalContext;

        if (context && typeof context === "string") {
          if (!existsSync(workspaceDir)) {
            mkdirSync(workspaceDir, { recursive: true });
          }
          await writeFile(join(workspaceDir, "MEMORY.md"), context, "utf-8");
          api.logger.info?.(`crab-mem: synced MEMORY.md for ${projectName}`);
        }
      } catch (e) {
        api.logger.warn?.(`crab-mem: failed to sync MEMORY.md for ${projectName}: ${e}`);
      }
    }

    // Record session init
    if (event.prompt && event.prompt.length >= 10) {
      await callHook("session-init", {
        session_id: sessionId,
        prompt: event.prompt,
        cwd: workspaceDir,
      });
    }
  });

  /**
   * Tool result: Record observations
   */
  api.on("tool_result_persist", (event, ctx) => {
    const toolName = event.toolName;
    if (!toolName || toolName.startsWith("memory_")) return;

    const sessionId = getSessionId(ctx.sessionKey);
    const workspaceDir = getWorkspaceForSession(ctx.sessionKey);

    // Extract result text
    const content = event.message?.content;
    let resultText = "";
    if (Array.isArray(content)) {
      const block = content.find(
        (c: any) => c.type === "tool_result" || c.type === "text"
      );
      if (block && "text" in block) {
        resultText = String(block.text).slice(0, 1000);
      }
    }

    callHookFireAndForget("observation", {
      session_id: sessionId,
      tool_name: toolName,
      tool_input: event.params || {},
      tool_response: resultText,
      cwd: workspaceDir,
    });
  });

  /**
   * Agent end: Summarize session
   */
  api.on("agent_end", async (event, ctx) => {
    const sessionId = getSessionId(ctx.sessionKey);
    const workspaceDir = getWorkspaceForSession(ctx.sessionKey);

    let lastMsg = "";
    if (Array.isArray(event.messages)) {
      for (let i = event.messages.length - 1; i >= 0; i--) {
        const m = event.messages[i] as any;
        if (m?.role === "assistant") {
          lastMsg =
            typeof m.content === "string"
              ? m.content
              : Array.isArray(m.content)
                ? m.content
                    .filter((c: any) => c.type === "text")
                    .map((c: any) => c.text)
                    .join("\n")
                : "";
          break;
        }
      }
    }

    callHookFireAndForget("summarize", {
      session_id: sessionId,
      last_assistant_message: lastMsg,
      cwd: workspaceDir,
    });
  });

  /**
   * Gateway start: Sync all workspaces
   */
  api.on("gateway_start", async () => {
    if (!config.syncMemoryFile) return;

    api.logger.info?.(`crab-mem: Syncing ${agentWorkspaces.size} workspace(s)...`);

    for (const [agentId, workspaceDir] of agentWorkspaces) {
      try {
        const result = await callHook("context", { cwd: workspaceDir });
        const context =
          (result as any)?.hookSpecificOutput?.additionalContext ||
          (result as any)?.additionalContext;

        if (context && typeof context === "string") {
          if (!existsSync(workspaceDir)) {
            mkdirSync(workspaceDir, { recursive: true });
          }
          await writeFile(join(workspaceDir, "MEMORY.md"), context, "utf-8");
          api.logger.info?.(`crab-mem: synced MEMORY.md for ${agentId}`);
        }
      } catch {
        // Silently continue
      }
    }
  });
}
