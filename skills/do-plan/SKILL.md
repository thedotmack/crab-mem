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

## Example Usage

```
User: /do-plan plans/websocket-feature.md

You (orchestrator):
1. Read the plan file
2. For Phase 1:
   a. Deploy Implementation subagent with phase context
   b. Wait for completion report with evidence
   c. Deploy Verification subagent
   d. Deploy Anti-pattern subagent  
   e. Deploy Code Quality subagent
   f. If all pass → Deploy Commit subagent
   g. If any fail → Debug and redeploy
3. Repeat for each phase
4. Report overall completion status
```

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
