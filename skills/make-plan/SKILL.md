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

## Example Usage

When asked to implement a complex feature:

```
User: Add WebSocket support to the server

You (orchestrator):
1. Deploy subagent: "Research WebSocket implementation patterns in this codebase and any docs"
2. Receive findings with specific file references and API signatures
3. Write Phase 0 output with allowed APIs
4. Write Phase 1-N implementation phases with verification checklists
5. Output the complete plan for execution with /do-plan
```

## Output Format

Write the plan to a file (e.g., `plans/feature-name.md`) so it can be referenced by `/do-plan`.
