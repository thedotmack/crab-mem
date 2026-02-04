/**
 * Crab-Mem OpenClaw Plugin
 * 
 * Persistent memory across sessions via claude-mem worker HTTP API.
 * Each workspace gets its own project-scoped context.
 * 
 * @author thedotmack
 * @license AGPL-3.0
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { writeFile } from "fs/promises";
import { join, basename } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, mkdirSync } from "fs";

// ============================================================================
// Types
// ============================================================================

interface CrabMemConfig {
  syncMemoryFile: boolean;
  workerPort: number;
  workerHost: string;
}

// ============================================================================
// Worker HTTP API
// ============================================================================

class WorkerClient {
  private baseUrl: string;
  private timeout: number = 30000;

  constructor(host: string = "127.0.0.1", port: number = 37777) {
    this.baseUrl = `http://${host}:${port}`;
  }

  /**
   * Check if worker is running and healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${this.baseUrl}/api/readiness`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get context for a project (returns MEMORY.md content)
   */
  async getContext(projects: string[]): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const projectsParam = projects.join(",");
      const response = await fetch(
        `${this.baseUrl}/api/context/inject?projects=${encodeURIComponent(projectsParam)}`,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  /**
   * Initialize a session with prompt
   */
  async sessionInit(sessionId: string, prompt: string, project: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/sessions/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          prompt,
          cwd: project,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Record an observation from tool use
   */
  async recordObservation(
    sessionId: string,
    toolName: string,
    toolInput: unknown,
    toolResponse: string,
    project: string
  ): Promise<void> {
    // Fire and forget - don't await
    fetch(`${this.baseUrl}/api/sessions/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: toolName,
        tool_input: toolInput,
        tool_response: toolResponse,
        cwd: project,
      }),
    }).catch(() => {
      // Ignore errors - fire and forget
    });
  }

  /**
   * Summarize a session
   */
  async summarize(sessionId: string, lastMessage: string, project: string): Promise<void> {
    // Fire and forget - don't await
    fetch(`${this.baseUrl}/api/sessions/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        last_assistant_message: lastMessage,
        cwd: project,
      }),
    }).catch(() => {
      // Ignore errors - fire and forget
    });
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

function loadWorkerConfig(): { host: string; port: number } {
  try {
    const settingsPath = join(homedir(), ".claude-mem/settings.json");
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      return {
        host: settings.CLAUDE_MEM_WORKER_HOST || "127.0.0.1",
        port: parseInt(settings.CLAUDE_MEM_WORKER_PORT, 10) || 37777,
      };
    }
  } catch {}
  return { host: "127.0.0.1", port: 37777 };
}

// ============================================================================
// Plugin Registration
// ============================================================================

export const id = "crab-mem";
export const name = "Crab-Mem (Persistent Memory)";

export default function register(api: OpenClawPluginApi) {
  const userConfig = (api.pluginConfig || {}) as Partial<CrabMemConfig>;
  const workerSettings = loadWorkerConfig();

  const config: CrabMemConfig = {
    syncMemoryFile: userConfig.syncMemoryFile ?? true,
    workerPort: userConfig.workerPort ?? workerSettings.port,
    workerHost: userConfig.workerHost ?? workerSettings.host,
  };

  const worker = new WorkerClient(config.workerHost, config.workerPort);
  const agentWorkspaces = loadAgentWorkspaces();

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

  // Check worker on startup
  worker.isHealthy().then((healthy) => {
    if (healthy) {
      api.logger.info?.(
        `crab-mem: Connected to worker at ${config.workerHost}:${config.workerPort} (${agentWorkspaces.size} workspaces)`
      );
    } else {
      api.logger.warn?.(
        `crab-mem: Worker not responding at ${config.workerHost}:${config.workerPort}. ` +
        `Start with: bun ~/.claude/plugins/cache/thedotmack/claude-mem/*/scripts/worker-service.cjs start`
      );
    }
  });

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

      const context = await worker.getContext([projectName]);
      if (context) {
        try {
          if (!existsSync(workspaceDir)) {
            mkdirSync(workspaceDir, { recursive: true });
          }
          await writeFile(join(workspaceDir, "MEMORY.md"), context, "utf-8");
          api.logger.info?.(`crab-mem: Synced MEMORY.md for ${projectName}`);
        } catch (e) {
          api.logger.warn?.(`crab-mem: Failed to write MEMORY.md: ${e}`);
        }
      }
    }

    // Record session init
    if (event.prompt && event.prompt.length >= 10) {
      await worker.sessionInit(sessionId, event.prompt, workspaceDir);
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

    worker.recordObservation(
      sessionId,
      toolName,
      event.params || {},
      resultText,
      workspaceDir
    );
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

    worker.summarize(sessionId, lastMsg, workspaceDir);
  });

  /**
   * Gateway start: Sync all workspaces
   */
  api.on("gateway_start", async () => {
    if (!config.syncMemoryFile) return;

    const healthy = await worker.isHealthy();
    if (!healthy) {
      api.logger.warn?.("crab-mem: Worker not available, skipping initial sync");
      return;
    }

    api.logger.info?.(`crab-mem: Syncing ${agentWorkspaces.size} workspace(s)...`);

    for (const [agentId, workspaceDir] of agentWorkspaces) {
      const projectName = basename(workspaceDir);
      const context = await worker.getContext([projectName]);
      
      if (context) {
        try {
          if (!existsSync(workspaceDir)) {
            mkdirSync(workspaceDir, { recursive: true });
          }
          await writeFile(join(workspaceDir, "MEMORY.md"), context, "utf-8");
          api.logger.info?.(`crab-mem: Synced MEMORY.md for ${agentId}`);
        } catch {
          // Silently continue
        }
      }
    }
  });
}
