#!/usr/bin/env node
/**
 * Crab-Mem OpenClaw Setup Script
 * 
 * Auto-installs claude-mem worker if not present.
 * Runs on `npm install` via postinstall hook.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync, spawnSync } from 'child_process';

const WORKER_PATHS = [
  // Plugin cache (most common)
  join(homedir(), '.claude/plugins/cache/thedotmack/claude-mem'),
  // Marketplace install
  join(homedir(), '.claude/plugins/marketplaces/thedotmack/plugin/scripts'),
  // Local dev
  join(homedir(), 'Projects/claude-mem/scripts'),
];

function findWorkerService() {
  // Check cache directory (versioned)
  const cacheDir = WORKER_PATHS[0];
  if (existsSync(cacheDir)) {
    try {
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
            latest = entry;
          }
        }
      }
      
      if (latest) {
        return join(cacheDir, latest, 'scripts/worker-service.cjs');
      }
    } catch (e) {
      // Continue to next path
    }
  }
  
  // Check other paths
  for (const basePath of WORKER_PATHS.slice(1)) {
    const workerPath = join(basePath, 'worker-service.cjs');
    if (existsSync(workerPath)) {
      return workerPath;
    }
  }
  
  return null;
}

function installClaudeMem() {
  console.log('🦀 Crab-Mem: Installing claude-mem worker service...');
  
  try {
    // Check if claude CLI is available
    const claudeCheck = spawnSync('claude', ['--version'], { encoding: 'utf-8' });
    if (claudeCheck.error) {
      console.log('⚠️  Claude CLI not found. Please install claude-mem manually:');
      console.log('   claude plugins add thedotmack/claude-mem');
      return false;
    }
    
    // Install via claude plugins
    console.log('   Running: claude plugins add thedotmack/claude-mem');
    execSync('claude plugins add thedotmack/claude-mem', {
      stdio: 'inherit',
      timeout: 120000 // 2 minute timeout
    });
    
    return true;
  } catch (error) {
    console.error('❌ Failed to install claude-mem:', error.message);
    console.log('   Please install manually: claude plugins add thedotmack/claude-mem');
    return false;
  }
}

function main() {
  console.log('');
  console.log('🦀 Crab-Mem OpenClaw Plugin Setup');
  console.log('─'.repeat(40));
  
  // Check for existing worker
  let workerPath = findWorkerService();
  
  if (workerPath) {
    console.log('✓ Worker service found:', workerPath);
    console.log('');
    console.log('🎉 Setup complete! Restart OpenClaw gateway to activate.');
    console.log('');
    return;
  }
  
  // Worker not found, attempt install
  console.log('⚡ Worker service not found, installing...');
  
  const installed = installClaudeMem();
  
  if (installed) {
    workerPath = findWorkerService();
    if (workerPath) {
      console.log('');
      console.log('✓ Worker service installed:', workerPath);
      console.log('');
      console.log('🎉 Setup complete! Restart OpenClaw gateway to activate.');
      console.log('');
      return;
    }
  }
  
  console.log('');
  console.log('⚠️  Worker service not detected after install.');
  console.log('   The plugin will retry detection on gateway start.');
  console.log('');
  console.log('   If issues persist, install manually:');
  console.log('   claude plugins add thedotmack/claude-mem');
  console.log('');
}

main();
