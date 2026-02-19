#!/usr/bin/env node --experimental-strip-types

/**
 * OpenClaw Docker Entrypoint
 *
 * Runs as a s6-overlay cont-init.d script at container startup:
 * 1. Creates workspace/skills combining bundled + custom
 * 2. Generates s6 service dirs in /run/service/ for gateway + custom services
 *
 * s6-overlay then supervises all services with automatic restart.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const CONFIG_DIR = "/home/node/.openclaw";
const WORKSPACE_DIR = `${CONFIG_DIR}/workspace`;
// Use managed skills dir (shared across all agents) instead of workspace-specific
const SKILLS_DIR = `${CONFIG_DIR}/skills`;
const BUNDLED_SKILLS = "/app/skills";
const CUSTOM_SKILLS = "/skills-custom";
const SERVICES_FILE = `${CONFIG_DIR}/services.json`;
const S6_SERVICES_DIR = "/run/service";

interface ServiceConfig {
  name: string;
  command: string;
  condition?: string;
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
 * Write an s6 service dir to /run/service/{name}/
 * The run script uses /command/s6-setuidgid to drop privileges to the node user.
 */
function writeS6Service(
  name: string,
  command: string,
  opts: { cwd?: string; condition?: string; restartDelay?: number } = {}
): void {
  const dir = `${S6_SERVICES_DIR}/${name}`;
  mkdirSync(dir, { recursive: true });

  // Condition check: pause and exit (causing s6 restart) if condition not met
  let conditionCheck = "";
  if (opts.condition?.startsWith("file:")) {
    const file = opts.condition.slice(5);
    conditionCheck = `[ ! -f "${file}" ] && sleep 30 && exit 0\n`;
  }

  const cdLine = opts.cwd ? `cd ${opts.cwd}\n` : "";

  // run script: executed by s6-svscan, drops to node user via s6-setuidgid
  const runScript = `#!/bin/sh\n${conditionCheck}${cdLine}exec /command/s6-setuidgid node ${command}\n`;
  writeFileSync(`${dir}/run`, runScript, { mode: 0o755 });

  // finish script: delay before s6 restarts the service (prevents rapid respawn)
  const delay = opts.restartDelay ?? 5;
  writeFileSync(`${dir}/finish`, `#!/bin/sh\nsleep ${delay}\n`, { mode: 0o755 });
}

/**
 * Generate s6 service dirs for gateway + any custom services from services.json.
 * s6-svscan will pick these up and supervise them with automatic restart.
 */
function generateS6Services(): void {
  mkdirSync(S6_SERVICES_DIR, { recursive: true });

  // Gateway: always present, restarts quickly on crash
  // --bind lan is configured in openclaw.json (gateway.bind: "lan")
  writeS6Service("gateway", "node dist/index.js gateway", {
    cwd: "/app",
    restartDelay: 1,
  });
  console.log("[entrypoint] s6 service registered: gateway");

  // Custom services from services.json (written by polyclaw syncInstanceFolders)
  if (existsSync(SERVICES_FILE)) {
    try {
      const services: ServiceConfig[] = JSON.parse(
        readFileSync(SERVICES_FILE, "utf-8")
      );
      for (const svc of services) {
        writeS6Service(svc.name, svc.command, {
          condition: svc.condition,
          restartDelay: 5,
        });
        console.log(`[entrypoint] s6 service registered: ${svc.name}`);
      }
    } catch {
      console.warn("[entrypoint] Failed to parse services.json, skipping");
    }
  }
}

function main(): void {
  setupSkills();
  generateS6Services();
}

main();
