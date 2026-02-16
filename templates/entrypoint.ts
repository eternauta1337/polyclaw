#!/usr/bin/env node --experimental-strip-types

/**
 * OpenClaw Docker Entrypoint
 *
 * Executed when each container starts:
 * 1. Creates workspace/skills combining bundled + custom
 * 2. Starts the gateway with passed arguments
 */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
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
const START_SCRIPT = "/tmp/start-services.sh";

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
            chmodSync(target, 0o755);
          } catch {
            // Read-only mount — file should already have correct permissions from host
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
 * Generate ecosystem config and start all services via pm2-runtime
 * This makes pm2 the main process (PID 1) managing both gateway and services
 */
function startWithPm2(args: string[]): void {
  // Check if pm2 is available
  const pm2Check = spawnSync("which", ["pm2"]);
  const hasPm2 = pm2Check.status === 0;

  if (!hasPm2) {
    // Fallback: run gateway directly without pm2
    console.log("[entrypoint] pm2 not available, running gateway directly");
    startGatewayDirect(args);
    return;
  }

  // Build apps list starting with gateway
  const apps: Array<Record<string, unknown>> = [
    {
      name: "gateway",
      script: "dist/index.js",
      args: ["gateway", ...args].join(" "),
      cwd: "/app",
      interpreter: "node",
      autorestart: true,
      restart_delay: 1000,
    },
  ];

  // Add custom services if configured
  if (existsSync(SERVICES_FILE)) {
    const services: ServiceConfig[] = JSON.parse(
      readFileSync(SERVICES_FILE, "utf-8")
    );

    for (const svc of services) {
      // Create wrapper script that checks condition before running
      const wrapperPath = `/tmp/svc-${svc.name}.sh`;
      const conditionCheck = svc.condition
        ? `if [ ! -f "${svc.condition.replace("file:", "")}" ]; then echo "[${svc.name}] Condition not met, waiting..."; sleep 60; exit 0; fi`
        : "";

      const wrapperScript = `#!/bin/bash
${conditionCheck}
exec ${svc.command}
`;
      writeFileSync(wrapperPath, wrapperScript, { mode: 0o755 });

      apps.push({
        name: svc.name,
        script: wrapperPath,
        interpreter: "/bin/bash",
        autorestart: true,
        restart_delay: 5000,
      });
    }
  }

  const serviceCount = apps.length - 1; // excluding gateway
  console.log(`[entrypoint] Starting gateway + ${serviceCount} service(s) via pm2...`);

  // Write ecosystem file
  const ecosystem = { apps };
  const ecosystemPath = "/tmp/ecosystem.config.json";
  writeFileSync(ecosystemPath, JSON.stringify(ecosystem, null, 2));

  // Write start script — the shell wrapper in docker-compose entrypoint
  // will exec into this, replacing itself so pm2-runtime becomes PID 1
  writeFileSync(
    START_SCRIPT,
    `#!/bin/sh\ncd /app\nexec pm2-runtime start ${ecosystemPath}\n`,
    { mode: 0o755 },
  );
}

/**
 * Fallback: run gateway directly without pm2
 */
function startGatewayDirect(args: string[]): void {
  console.log(`[entrypoint] Starting gateway directly (no pm2)...`);

  // Write start script — exec replaces the shell with node directly
  writeFileSync(
    START_SCRIPT,
    `#!/bin/sh\ncd /app\nexec node dist/index.js gateway ${args.join(" ")}\n`,
    { mode: 0o755 },
  );
}

function main(): void {
  const args = process.argv.slice(2);
  setupSkills();

  // Only use pm2 if there are extra services to manage
  let hasServices = false;
  if (existsSync(SERVICES_FILE)) {
    try {
      const services: ServiceConfig[] = JSON.parse(
        readFileSync(SERVICES_FILE, "utf-8")
      );
      hasServices = services.length > 0;
    } catch {
      // Invalid JSON, treat as no services
    }
  }

  if (hasServices) {
    startWithPm2(args);
  } else {
    startGatewayDirect(args);
  }
}

main();
