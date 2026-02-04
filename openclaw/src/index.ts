/**
 * Crab-Mem OpenClaw Plugin
 * 
 * Persistent memory across sessions with automatic MEMORY.md sync.
 * Each workspace gets its own project-scoped context.
 * 
 * Install: openclaw plugins install @crab-mem/openclaw
 * 
 * @author thedotmack
 * @license AGPL-3.0
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { writeFile, readFile } from "fs/promises";
import { join, basename } from "path";
import { homedir } from "os";
import { spawn } from "child_process";
import { existsSync, readdirSync, statSync, readFileSync, mkdirSync } from "fs";

// ============================================================================
// Types
// ============================================================================

interface CrabMemConfig {
  syncMemoryFile: boolean;
  workerPort: number;
  workerPath?: string;
  contextTokenLimit: number;
}

interface HookResult {
  hookSpecificOutput?: {
    additionalContext?: string;
  };
  additionalContext?: string;
}

// ============================================================================
// Worker Discovery
// ============================================================================

const WORKER_SEARCH_PATHS = [
  // Plugin cache (versioned, most common)
  join(homedir(), ".claude/plugins/cache/thedotmack/claude-mem"),
  // Marketplace install
  join(homedir(), ".claude/plugins/marketplaces/thedotmack/plugin/scripts"),
  // Local development
  join(homedir(), "Projects/claude-mem/scripts"),
  "/Projects/claude-mem/scripts",
];

function findWorkerService(customPath?: string): string | null {
  // Custom path takes priority
  if (customPath && existsSync(customPath)) {
    return customPath;
  }

  // Search cache directory (versioned installs)
  const cacheDir = WORKER_SEARCH_PATHS[0];
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
            latest = workerPath;
          }
        }
      }

      if (latest) return latest;
    } catch {
      // Continue searching
    }
  }

  // Search other paths
  for (const basePath of WORKER_SEARCH_PATHS.slice(1)) {
    const workerPath = join(basePath, "worker-service.cjs");
    if (existsSync(workerPath)) {
      return workerPath;
    }
  }

  return null;
}

// ============================================================================
// Worker Communication
// ============================================================================

function callHook(
  workerPath: string,
  hookName: string,
  data: Record<string, unknown>
): Promise<HookResult | null> {
  return new Promise((resolve) => {
    try {
      const proc = spawn("bun", [workerPath, "hook", "claude-code", hookName], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      proc.stdin.write(JSON.stringify(data));
      proc.stdin.end();

      proc.on("close", (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve(null);
        }
      });

      proc.on("error", () => resolve(null));

      // 30 second timeout
      setTimeout(() => {
        proc.kill();
        resolve(null);
      }, 30000);
    } catch {
      resolve(null);
    }
  });
}

function callHookFireAndForget(
  workerPath: string,
  hookName: string,
  data: Record<string, unknown>
): void {
  try {
    const proc = spawn("bun", [workerPath, "hook", "claude-code", hookName], {
      stdio: ["pipe", "ignore", "ignore"],
      detached: true,
    });
    proc.stdin.write(JSON.stringify(data));
    proc.stdin.end();
    proc.unref();
  } catch {
    // Fire and forget - ignore errors
  }
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

      // Map each agent to its workspace
      const agents = cfg.agents?.list || [];
      for (const agent of agents) {
        const ws = agent.workspace || defaultWs;
        workspaces.set(agent.id, ws);
      }

      // Ensure defaults
      if (!workspaces.has("default")) {
        workspaces.set("default", defaultWs);
      }
      if (!workspaces.has("main")) {
        workspaces.set("main", defaultWs);
      }
    }
  } catch {
    // Fallback to default workspace
    workspaces.set("default", join(homedir(), ".openclaw/workspace"));
  }

  return workspaces;
}

function extractAgentId(sessionKey?: string): string {
  if (!sessionKey) return "main";
  const parts = sessionKey.split(":");
  return parts[0] || "main";
}

// ============================================================================
// Plugin Registration
// ============================================================================

export const id = "crab-mem";
export const name = "Crab-Mem (Persistent Memory)";

export default function register(api: OpenClawPluginApi) {
  const userConfig = (api.pluginConfig || {}) as Partial<CrabMemConfig>;

  // Resolve worker path
  const workerPath = findWorkerService(userConfig.workerPath);

  if (!workerPath) {
    api.logger.warn?.(
      "crab-mem: Worker service not found. Install with: claude plugins add thedotmack/claude-mem"
    );
    return;
  }

  // Load configuration with defaults
  const config: CrabMemConfig = {
    syncMemoryFile: userConfig.syncMemoryFile ?? true,
    workerPort: userConfig.workerPort ?? 37777,
    contextTokenLimit: userConfig.contextTokenLimit ?? 20000,
    workerPath,
  };

  // Load all agent workspaces
  const agentWorkspaces = loadAgentWorkspaces();

  api.logger.info?.(
    `crab-mem: Ready (${agentWorkspaces.size} workspaces, worker: ${basename(workerPath)})`
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
        const result = await callHook(workerPath!, "context", { cwd: workspaceDir });
        const context =
          (result as HookResult)?.hookSpecificOutput?.additionalContext ||
          (result as HookResult)?.additionalContext;

        if (context && typeof context === "string") {
          // Ensure workspace exists
          if (!existsSync(workspaceDir)) {
            mkdirSync(workspaceDir, { recursive: true });
          }

          await writeFile(join(workspaceDir, "MEMORY.md"), context, "utf-8");
          api.logger.info?.(`crab-mem: Synced MEMORY.md for ${projectName}`);
        }
      } catch (e) {
        api.logger.warn?.(
          `crab-mem: Failed to sync MEMORY.md for ${projectName}: ${e}`
        );
      }
    }

    // Record session initialization
    if (event.prompt && event.prompt.length >= 10) {
      await callHook(workerPath!, "session-init", {
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

    // Skip memory tools to avoid recursion
    if (!toolName || toolName.startsWith("memory_")) return;

    const sessionId = getSessionId(ctx.sessionKey);
    const workspaceDir = getWorkspaceForSession(ctx.sessionKey);

    // Extract tool result text
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

    // Fire and forget observation recording
    callHookFireAndForget(workerPath!, "observation", {
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

    // Extract last assistant message
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

    // Fire and forget summarization
    callHookFireAndForget(workerPath!, "summarize", {
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
        const result = await callHook(workerPath!, "context", { cwd: workspaceDir });
        const context =
          (result as HookResult)?.hookSpecificOutput?.additionalContext ||
          (result as HookResult)?.additionalContext;

        if (context && typeof context === "string") {
          // Ensure workspace exists
          if (!existsSync(workspaceDir)) {
            mkdirSync(workspaceDir, { recursive: true });
          }

          await writeFile(join(workspaceDir, "MEMORY.md"), context, "utf-8");
          api.logger.info?.(`crab-mem: Synced MEMORY.md for ${agentId}`);
        }
      } catch {
        // Silently continue - workspace may not have any history yet
      }
    }
  });
}
