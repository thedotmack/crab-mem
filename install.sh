#!/usr/bin/env bash
#
#  🦀 CRAB-MEM INSTALLER (by Claude-Mem.ai) 🦀
#  
#  Installs Crab-Mem plugin to ~/.openclaw/plugins/
#

set -e

CRAB_MEM_VERSION="1.1.0"

CRAB="🦀"
GREEN='\033[0;32m'
GOLD='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${GOLD}═══════════════════════════════════════════${NC}"
echo -e "${CRAB}  ${GOLD}CRAB-MEM INSTALLER${NC}  ${CRAB}"
echo -e "${GOLD}    by Claude-Mem.ai${NC}"
echo -e "${GOLD}═══════════════════════════════════════════${NC}"
echo ""

# Check for bun
if ! command -v bun &> /dev/null; then
    echo "Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

# Install claude-mem worker via Claude CLI
if command -v claude &> /dev/null; then
    echo "[${CRAB}] Installing claude-mem worker..."
    if claude plugins add thedotmack/claude-mem; then
        echo -e "${GREEN}[✓]${NC} Worker installed via Claude CLI"
    else
        echo -e "${GOLD}[!]${NC} Worker install returned non-zero (may already be installed)"
    fi
else
    echo -e "${GOLD}[!]${NC} Claude CLI not found"
    echo "    The worker provides memory persistence. To install it:"
    echo "    1. Install Claude CLI, then run: claude plugins add thedotmack/claude-mem"
    echo "    2. Or configure OpenRouter provider (advanced)"
fi

# Provider configuration
echo ""
echo "Which LLM provider for memory processing?"
echo "  1) Claude (default - requires Claude CLI logged in)"
echo "  2) OpenRouter (free tier available!)"
echo "  3) Gemini"
read -p "Enter choice [1]: " PROVIDER_CHOICE

case "$PROVIDER_CHOICE" in
  2)
    PROVIDER="openrouter"
    read -p "OpenRouter API key (get free at openrouter.ai/keys): " OR_KEY
    ;;
  3)
    PROVIDER="gemini"
    read -p "Gemini API key: " GEMINI_KEY
    ;;
  *)
    PROVIDER="claude"
    ;;
esac

# Write settings
mkdir -p ~/.claude-mem
cat > ~/.claude-mem/settings.json << SETTINGS
{
  "CLAUDE_MEM_PROVIDER": "$PROVIDER",
  "CLAUDE_MEM_OPENROUTER_API_KEY": "${OR_KEY:-}",
  "CLAUDE_MEM_GEMINI_API_KEY": "${GEMINI_KEY:-}",
  "CLAUDE_MEM_OPENROUTER_MODEL": "xiaomi/mimo-v2-flash:free"
}
SETTINGS
echo "[${CRAB}] Settings saved to ~/.claude-mem/settings.json"

# Create plugins directory
PLUGIN_DIR="$HOME/.openclaw/plugins/memory-claudemem"
mkdir -p "$PLUGIN_DIR"

echo "[${CRAB}] Installing Crab-Mem plugin to $PLUGIN_DIR"

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
  "name": "Crab-Mem (by Claude-Mem.ai)",
  "description": "Crab-Mem 🦀 - Persistent memory for OpenClaw via claude-mem",
  "kind": "memory",
  "version": "1.0.0"
}
MANIFEST

cat > "$PLUGIN_DIR/package.json" << 'PKG'
{"name": "memory-claudemem", "version": "1.0.0", "main": "index.ts"}
PKG

# Save version for update checking
echo "$CRAB_MEM_VERSION" > "$PLUGIN_DIR/version.txt"

echo -e "${GREEN}[✓]${NC} Crab-Mem v$CRAB_MEM_VERSION installed to $PLUGIN_DIR"

# Install skills
SKILLS_DIR="$HOME/.openclaw/workspace/skills"
mkdir -p "$SKILLS_DIR/make-plan" "$SKILLS_DIR/do-plan"

echo "[${CRAB}] Installing Crab-Mem skills to $SKILLS_DIR"

# make-plan skill
cat > "$SKILLS_DIR/make-plan/SKILL.md" << 'SKILL_MAKEPLAN'
---
name: make-plan
description: Create an implementation plan with documentation discovery. Use for complex features or multi-phase tasks that need structured planning before execution.
---

# Make Plan Skill

Create LLM-friendly implementation plans that can be executed in phases, using subagents for research and fact-gathering.

## When to Use

- Complex features requiring multiple steps
- Tasks that need documentation research first
- Multi-file or multi-system changes
- Anything where "just winging it" would lead to invented APIs

## How It Works

You are an **ORCHESTRATOR**. Create plans in phases that can be executed consecutively.

### Delegation Model

- Use **subagents for fact gathering**: docs, examples, signatures, grep results
- Keep **synthesis and plan authoring** with the orchestrator
- If a subagent report is incomplete, re-check with targeted reads/greps

### Subagent Reporting Contract (MANDATORY)

Each subagent response must include:
1. **Sources consulted** - files/URLs and what was read
2. **Concrete findings** - exact API names/signatures, exact file paths
3. **Copy-ready snippet locations** - example files/sections to copy
4. **Confidence note + gaps** - what might still be missing

Reject and redeploy the subagent if it reports conclusions without sources.

## Plan Structure

### Phase 0: Documentation Discovery (ALWAYS FIRST)

Before planning implementation, deploy "Documentation Discovery" subagents to:

1. Search for and read relevant documentation, examples, and existing patterns
2. Identify the actual APIs, methods, and signatures available (not assumed)
3. Create a brief "Allowed APIs" list citing specific documentation sources
4. Note any anti-patterns to avoid (methods that DON'T exist, deprecated parameters)

Then consolidate findings into a single Phase 0 output.

### Each Implementation Phase Must Include

1. **What to implement** - Frame tasks to COPY from docs, not transform existing code
   - ✅ Good: "Copy the V2 session pattern from docs/examples.ts:45-60"
   - ❌ Bad: "Migrate the existing code to V2"
2. **Documentation references** - Cite specific files/lines for patterns to follow
3. **Verification checklist** - How to prove this phase worked (tests, grep checks)
4. **Anti-pattern guards** - What NOT to do (invented APIs, undocumented params)

### Final Phase: Verification

1. Verify all implementations match documentation
2. Check for anti-patterns (grep for known bad patterns)
3. Run tests to confirm functionality

## Key Principles

- **Documentation Availability ≠ Usage**: Explicitly require reading docs
- **Task Framing Matters**: Direct agents to docs, not just outcomes
- **Verify > Assume**: Require proof, not assumptions about APIs
- **Session Boundaries**: Each phase should be self-contained with its own doc references

## Anti-Patterns to Prevent

- ❌ Inventing API methods that "should" exist
- ❌ Adding parameters not in documentation
- ❌ Skipping verification steps
- ❌ Assuming structure without checking examples

## Output Format

Write the plan to a file (e.g., `plans/feature-name.md`) so it can be referenced by `/do-plan`.
SKILL_MAKEPLAN

# do-plan skill
cat > "$SKILLS_DIR/do-plan/SKILL.md" << 'SKILL_DOPLAN'
---
name: do-plan
description: Execute a plan using subagents for implementation. Use after /make-plan has created a structured plan, or for any multi-phase task execution.
---

# Do Plan Skill

Execute implementation plans by deploying subagents for each phase. You coordinate; they execute.

## When to Use

- After `/make-plan` has created a structured plan
- For any multi-phase task that needs coordinated execution
- When you want verified, incremental progress with commits

## How It Works

You are an **ORCHESTRATOR**. Deploy subagents to execute *all* work.

**Do not do the work yourself** except to:
- Coordinate and route context
- Verify that each subagent completed its assigned checklist
- Decide whether to advance to the next phase

## Execution Protocol

### For Each Phase

Deploy an **"Implementation" subagent** to:

1. Execute the implementation as specified in the plan
2. **COPY patterns from documentation** - don't invent
3. Cite documentation sources in code comments when using unfamiliar APIs
4. If an API seems missing, **STOP and verify** - don't assume it exists

### After Each Phase

Deploy subagents for verification (do not proceed until all pass):

| Subagent | Responsibility |
|----------|----------------|
| **Verification** | Run the phase's verification checklist, prove it worked |
| **Anti-pattern** | Grep for known bad patterns from the plan |
| **Code Quality** | Review changes for obvious issues |
| **Commit** | Commit *only after* verification passes |

### Between Phases

Deploy a **"Branch/Sync" subagent** to:
- Push to working branch after each verified phase
- Prepare the next phase handoff with plan context

## Orchestrator Rules

1. Each phase uses **fresh subagents** where noted (or when context is large/unclear)
2. Assign **one clear objective per subagent** and require evidence:
   - Commands run
   - Outputs produced
   - Files changed
3. **Do not advance** until the assigned subagent reports completion AND you confirm it matches the plan

## Failure Modes to Prevent

- ❌ Don't invent APIs that "should" exist - verify against docs
- ❌ Don't add undocumented parameters - copy exact signatures
- ❌ Don't skip verification - deploy a verification subagent
- ❌ Don't commit before verification passes

## Subagent Spawning

Use `sessions_spawn` to deploy subagents:

```
sessions_spawn(
  task="[Phase N Implementation] Copy the auth middleware pattern from docs/auth.md:45-80 into src/middleware/websocket.ts. Report: files changed, commands run, verification status.",
  label="phase-1-impl"
)
```

Each subagent should be given:
- Clear scope (one phase, one responsibility)
- Specific file/doc references from the plan
- Required output format (evidence of completion)

## Progress Tracking

Keep a running status in the conversation:

```
## Execution Status

- [x] Phase 0: Documentation Discovery ✅
- [x] Phase 1: Core WebSocket Handler ✅ (commit: abc123)
- [ ] Phase 2: Authentication Integration (in progress)
- [ ] Phase 3: Error Handling
- [ ] Phase 4: Final Verification
```
SKILL_DOPLAN

echo -e "${GREEN}[✓]${NC} Crab-Mem skills installed: make-plan, do-plan"

echo ""
echo -e "${CYAN}Add to ~/.openclaw/openclaw.json:${NC}"
echo '  "plugins": {'
echo '    "slots": { "memory": "memory-claudemem" },'
echo '    "entries": { "memory-claudemem": { "enabled": true } }'
echo '  }'
echo ""
echo -e "${CRAB} Restart OpenClaw: openclaw gateway restart"
echo ""
