#!/usr/bin/env node --experimental-strip-types

/**
 * OpenClaw Docker Entrypoint / Process Supervisor
 *
 * Runs as PID 1 (root). Responsibilities:
 * 1. Setup: workspace dirs, skills symlinks, skill CLI binaries
 * 2. Supervisor: starts and restarts gateway + custom services from services.json
 *
 * Services run as node (uid=1000) via spawn uid/gid options.
 * Optional preCommand runs as root before spawning (e.g. chmod for VirtioFS bind mounts).
 */

import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { resolve } from "node:path";

const CONFIG_DIR = "/home/node/.openclaw";
const WORKSPACE_DIR = `${CONFIG_DIR}/workspace`;
// Use managed skills dir (shared across all agents) instead of workspace-specific
const SKILLS_DIR = `${CONFIG_DIR}/skills`;
const BUNDLED_SKILLS = "/app/skills";
const CUSTOM_SKILLS = "/skills-custom";
const SERVICES_FILE = `${CONFIG_DIR}/services.json`;

const NODE_UID = 1000;
const NODE_GID = 1000;
const NODE_HOME = "/home/node";

interface ServiceConfig {
  name: string;
  command: string;
  condition?: string;
  // Optional command to run as root before spawning the service.
  // Use for VirtioFS bind mount setup (e.g. chmod) that requires root.
  preCommand?: string;
  // Seconds to wait before restarting after exit. Default: 5.
  restartDelay?: number;
  // Seconds to wait before the initial start. Default: 0.
  startDelay?: number;
}

function setupSkills(): void {
  // Create workspace directory if it doesn't exist
  if (!existsSync(WORKSPACE_DIR)) {
    mkdirSync(WORKSPACE_DIR, { recursive: true });
  }

  // Clean skills directory if exists (including broken symlinks)
  try {
    lstatSync(SKILLS_DIR); // Detects broken symlinks (existsSync doesn't)
    rmSync(SKILLS_DIR, { recursive: true, force: true });
  } catch {
    // Doesn't exist, OK
  }
  mkdirSync(SKILLS_DIR, { recursive: true });

  // Symlink bundled skills
  if (existsSync(BUNDLED_SKILLS)) {
    const bundled = readdirSync(BUNDLED_SKILLS);
    for (const skill of bundled) {
      const src = `${BUNDLED_SKILLS}/${skill}`;
      const dest = `${SKILLS_DIR}/${skill}`;
      if (!existsSync(dest)) {
        symlinkSync(src, dest);
      }
    }
    console.log(`[entrypoint] ${bundled.length} bundled skills linked`);
  }

  // Symlink custom skills (override bundled if same name)
  if (existsSync(CUSTOM_SKILLS)) {
    const custom = readdirSync(CUSTOM_SKILLS);
    for (const skill of custom) {
      const src = `${CUSTOM_SKILLS}/${skill}`;
      const dest = `${SKILLS_DIR}/${skill}`;
      // Remove if exists (override bundled)
      if (existsSync(dest)) {
        rmSync(dest, { recursive: true, force: true });
      }
      symlinkSync(src, dest);
    }
    if (custom.length > 0) {
      console.log(`[entrypoint] ${custom.length} custom skills linked`);
    }
  }

  // Auto-link skill CLIs: scan skills for package.json with bin entries
  // and create symlinks in /usr/local/bin so they're globally available
  linkSkillBinaries();
}

const SKILL_BIN_DIR = "/home/node/.local/bin";

function linkSkillBinaries(): void {
  if (!existsSync(SKILLS_DIR)) return;

  // Create user-writable bin directory and add to PATH
  mkdirSync(SKILL_BIN_DIR, { recursive: true });
  if (!process.env.PATH?.includes(SKILL_BIN_DIR)) {
    process.env.PATH = `${SKILL_BIN_DIR}:${process.env.PATH}`;
  }

  let linked = 0;
  for (const skill of readdirSync(SKILLS_DIR)) {
    const skillDir = `${SKILLS_DIR}/${skill}`;
    // Resolve symlink to actual path for reading files
    let realDir: string;
    try {
      realDir = realpathSync(skillDir);
    } catch {
      continue;
    }

    const pkgPath = `${realDir}/package.json`;
    if (!existsSync(pkgPath)) continue;

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (!pkg.bin || typeof pkg.bin !== "object") continue;

      for (const [name, binPath] of Object.entries(pkg.bin as Record<string, string>)) {
        const target = resolve(realDir, binPath);
        const link = `${SKILL_BIN_DIR}/${name}`;
        if (!existsSync(target)) continue;

        try {
          // Remove existing link if present
          if (existsSync(link)) rmSync(link);
          symlinkSync(target, link);
          try {
            // chmodSync intentionally omitted — read-only mounts throw, and
            // files should already have correct permissions from the host
          } catch {
            // no-op
          }
          linked++;
        } catch (err: any) {
          console.warn(`[entrypoint] Failed to link ${name}: ${err.message}`);
        }
      }
    } catch {
      // Invalid package.json, skip
    }
  }

  if (linked > 0) {
    console.log(`[entrypoint] ${linked} skill CLI(s) linked to ${SKILL_BIN_DIR}`);
  }
}

/**
 * Validate that a preCommand only uses allowed patterns.
 * preCommands run as root, so we restrict them to known-safe operations.
 */
const ALLOWED_PRECMD = /^chmod\s+-R\s+a\+rw\s+\/home\/node\/[^\s;&|`$()]+(\s+2>\/dev\/null\s+\|\|\s+true)?$/;

function validatePreCommand(cmd: string): boolean {
  return ALLOWED_PRECMD.test(cmd.trim());
}

/**
 * Start a service and restart it on exit.
 * Runs as node (uid=1000). If preCommand is set, runs it as root first.
 */
function startService(svc: ServiceConfig, attempt = 0): void {
  // Condition check: wait and retry if not met
  if (svc.condition?.startsWith("file:")) {
    const file = svc.condition.slice(5);
    if (!existsSync(file)) {
      if (attempt === 0 || attempt % 10 === 0) {
        console.log(`[supervisor] ${svc.name}: waiting for ${file}`);
      }
      setTimeout(() => startService(svc, attempt + 1), 30_000);
      return;
    }
  }

  // Pre-command: runs as root before spawning (e.g. chmod for VirtioFS bind mounts)
  // Validated against allowlist to prevent privilege escalation via services.json tampering.
  if (svc.preCommand) {
    if (!validatePreCommand(svc.preCommand)) {
      console.error(`[supervisor] BLOCKED: ${svc.name} has unsafe preCommand: ${svc.preCommand}`);
    } else {
      spawnSync("sh", ["-c", svc.preCommand], { stdio: "inherit" });
    }
  }

  const child = spawn("sh", ["-c", svc.command], {
    uid: NODE_UID,
    gid: NODE_GID,
    env: { ...process.env, HOME: NODE_HOME },
    stdio: "inherit",
  });

  console.log(`[supervisor] started: ${svc.name} (pid=${child.pid})`);

  child.on("exit", (code, signal) => {
    if (code === 0) {
      console.log(`[supervisor] ${svc.name} exited cleanly (code=0), not restarting`);
      return;
    }
    const delay = svc.restartDelay ?? 5;
    console.log(`[supervisor] ${svc.name} exited (code=${code ?? signal}), restarting in ${delay}s`);
    setTimeout(() => startService(svc), delay * 1000);
  });
}

function startAllServices(): void {
  // Gateway: always present, runs from /app
  const gateway: ServiceConfig = {
    name: "gateway",
    command: "cd /app && node dist/index.js gateway",
    restartDelay: 1,
  };
  console.log("[supervisor] registered: gateway");
  startService(gateway);

  // Custom services from services.json (written by polyclaw syncInstanceFolders)
  if (existsSync(SERVICES_FILE)) {
    try {
      const services: ServiceConfig[] = JSON.parse(
        readFileSync(SERVICES_FILE, "utf-8")
      );
      for (const svc of services) {
        console.log(`[supervisor] registered: ${svc.name}`);
        const delay = svc.startDelay ?? 0;
        if (delay > 0) {
          console.log(`[supervisor] ${svc.name}: delaying initial start by ${delay}s`);
          setTimeout(() => startService(svc), delay * 1000);
        } else {
          startService(svc);
        }
      }
    } catch {
      console.warn("[supervisor] failed to parse services.json, skipping custom services");
    }
  }
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

/**
 * Migrate legacy state that `openclaw doctor` would otherwise prompt for.
 * Runs once per container start; skips silently if already migrated.
 */
function migrateDoctor(): void {
  // 1. Telegram pairing allowFrom: renamed for multi-agent support
  const credDir = `${CONFIG_DIR}/credentials`;
  const oldAllowFrom = `${credDir}/telegram-allowFrom.json`;
  const newAllowFrom = `${credDir}/telegram-default-allowFrom.json`;
  if (existsSync(oldAllowFrom) && !existsSync(newAllowFrom)) {
    renameSync(oldAllowFrom, newAllowFrom);
    console.log("[entrypoint] migrated telegram-allowFrom.json → telegram-default-allowFrom.json");
  }

  // 2. Tighten ~/.openclaw permissions (best-effort; no-op on macOS VirtioFS)
  try {
    chmodSync(CONFIG_DIR, 0o700);
  } catch {
    // VirtioFS or read-only — ignore
  }
}

function cleanStaleLocks(): void {
  const wacliDir = `${CONFIG_DIR}/wacli`;
  const lockFile = `${wacliDir}/LOCK`;
  if (existsSync(lockFile)) {
    rmSync(lockFile);
    console.log("[entrypoint] removed stale wacli LOCK");
  }
}

async function main(): Promise<void> {
  setupSkills();
  cleanStaleLocks();
  migrateDoctor();

  const startupDelay = parseInt(process.env.STARTUP_DELAY || "0", 10);
  if (startupDelay > 0) {
    console.log(`[entrypoint] waiting ${startupDelay}s (staggered startup)`);
    await new Promise((resolve) => setTimeout(resolve, startupDelay * 1000));
  }

  startAllServices();
}

main();
