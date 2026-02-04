#!/usr/bin/env node
/**
 * Crab-Mem OpenClaw Doctor
 * 
 * Diagnoses installation and reports health status.
 */

import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CHECKS = [];

function check(name, fn) {
  try {
    const result = fn();
    CHECKS.push({ name, ok: result.ok, message: result.message, details: result.details });
  } catch (error) {
    CHECKS.push({ name, ok: false, message: error.message });
  }
}

function findWorkerService() {
  const cacheDir = join(homedir(), '.claude/plugins/cache/thedotmack/claude-mem');
  if (existsSync(cacheDir)) {
    const entries = readdirSync(cacheDir);
    let latest = null;
    let latestMtime = 0;
    
    for (const entry of entries) {
      const fullPath = join(cacheDir, entry);
      const workerPath = join(fullPath, 'scripts/worker-service.cjs');
      if (existsSync(workerPath)) {
        const stats = statSync(fullPath);
        if (stats.mtimeMs > latestMtime) {
          latestMtime = stats.mtimeMs;
          latest = workerPath;
        }
      }
    }
    return latest;
  }
  return null;
}

async function checkWorkerHealth(port = 37777) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function getWorkerStats(port = 37777) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/stats`, {
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) {
      return await response.json();
    }
  } catch {}
  return null;
}

async function main() {
  console.log('');
  console.log('🦀 Crab-Mem OpenClaw Doctor');
  console.log('═'.repeat(50));
  console.log('');
  
  // Check 1: Worker service file exists
  check('Worker service installed', () => {
    const workerPath = findWorkerService();
    if (workerPath) {
      return { ok: true, message: 'Found', details: workerPath };
    }
    return { ok: false, message: 'Not found - run: claude plugins add thedotmack/claude-mem' };
  });
  
  // Check 2: Worker service running
  check('Worker service running', async () => {
    const healthy = await checkWorkerHealth();
    if (healthy) {
      return { ok: true, message: 'Running on port 37777' };
    }
    return { ok: false, message: 'Not responding - start a Claude Code session to initialize' };
  });
  
  // Check 3: Database exists
  check('Database exists', () => {
    const dbPath = join(homedir(), '.claude-mem/claude-mem.db');
    if (existsSync(dbPath)) {
      const stats = statSync(dbPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      return { ok: true, message: `${sizeMB} MB`, details: dbPath };
    }
    return { ok: false, message: 'Not found - database created on first use' };
  });
  
  // Check 4: OpenClaw config
  check('OpenClaw plugin configured', () => {
    const configPath = join(homedir(), '.openclaw/openclaw.json');
    if (!existsSync(configPath)) {
      return { ok: false, message: 'openclaw.json not found' };
    }
    
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const slot = config.plugins?.slots?.memory;
      
      if (slot === 'crab-mem' || slot === 'memory-claudemem') {
        return { ok: true, message: `Memory slot: ${slot}` };
      }
      
      const enabled = config.plugins?.entries?.['crab-mem']?.enabled || 
                      config.plugins?.entries?.['memory-claudemem']?.enabled;
      if (enabled) {
        return { ok: true, message: 'Plugin enabled' };
      }
      
      return { ok: false, message: 'Plugin not enabled - set plugins.slots.memory = "crab-mem"' };
    } catch (e) {
      return { ok: false, message: `Config parse error: ${e.message}` };
    }
  });
  
  // Check 5: Workspaces configured
  check('Workspaces configured', () => {
    const configPath = join(homedir(), '.openclaw/openclaw.json');
    if (!existsSync(configPath)) {
      return { ok: false, message: 'openclaw.json not found' };
    }
    
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const agents = config.agents?.list || [];
    const workspaces = agents.map(a => a.workspace || config.agents?.defaults?.workspace).filter(Boolean);
    
    if (workspaces.length === 0) {
      return { ok: false, message: 'No workspaces found' };
    }
    
    return { ok: true, message: `${workspaces.length} workspace(s)`, details: workspaces };
  });
  
  // Check 6: MEMORY.md files
  check('MEMORY.md synced', () => {
    const configPath = join(homedir(), '.openclaw/openclaw.json');
    if (!existsSync(configPath)) {
      return { ok: false, message: 'Cannot check - no config' };
    }
    
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const agents = config.agents?.list || [];
    const defaultWs = config.agents?.defaults?.workspace || join(homedir(), '.openclaw/workspace');
    
    let found = 0;
    let missing = 0;
    
    for (const agent of agents) {
      const ws = agent.workspace || defaultWs;
      const memoryPath = join(ws, 'MEMORY.md');
      if (existsSync(memoryPath)) {
        found++;
      } else {
        missing++;
      }
    }
    
    if (found === 0) {
      return { ok: false, message: 'No MEMORY.md files - will sync on first session' };
    }
    
    return { ok: true, message: `${found} synced${missing ? `, ${missing} pending` : ''}` };
  });
  
  // Wait for async checks
  await Promise.all(CHECKS.map(c => c.message));
  
  // Print results
  console.log('Diagnostic Results:');
  console.log('─'.repeat(50));
  
  for (const c of CHECKS) {
    const icon = c.ok ? '✓' : '✗';
    const color = c.ok ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    
    console.log(`${color}${icon}${reset} ${c.name}: ${c.message}`);
    if (c.details && !c.ok) {
      console.log(`  ${typeof c.details === 'string' ? c.details : JSON.stringify(c.details)}`);
    }
  }
  
  const allOk = CHECKS.every(c => c.ok);
  console.log('');
  
  if (allOk) {
    console.log('🎉 All checks passed! Crab-Mem is healthy.');
  } else {
    console.log('⚠️  Some checks failed. See above for details.');
  }
  
  console.log('');
}

main().catch(console.error);
