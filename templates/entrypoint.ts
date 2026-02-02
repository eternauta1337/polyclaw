#!/usr/bin/env node --experimental-strip-types

/**
 * OpenClaw Docker Entrypoint
 *
 * Executed when each container starts:
 * 1. Creates workspace/skills combining bundled + custom
 * 2. Starts the gateway with passed arguments
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";

const WORKSPACE_DIR = "/home/node/.openclaw/workspace";
const SKILLS_DIR = `${WORKSPACE_DIR}/skills`;
const BUNDLED_SKILLS = "/app/skills";
const CUSTOM_SKILLS = "/skills-custom";

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
}

function startGateway(args: string[]): void {
  console.log(`[entrypoint] Starting gateway...`);

  const gateway = spawn("node", ["dist/index.js", "gateway", ...args], {
    stdio: "inherit",
    cwd: "/app",
  });

  gateway.on("error", (err) => {
    console.error("[entrypoint] Error starting gateway:", err.message);
    process.exit(1);
  });

  gateway.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

function main(): void {
  const args = process.argv.slice(2);
  setupSkills();
  startGateway(args);
}

main();
