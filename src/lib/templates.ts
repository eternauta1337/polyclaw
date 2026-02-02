/**
 * Template file management
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { randomBytes } from "node:crypto";
import type { ConfigPaths, InfraConfig, InstanceConfig } from "./config.js";
import { DEFAULTS, getPath } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "..", "templates");

export interface TemplateFile {
  name: string;
  required: boolean;
}

const TEMPLATE_FILES: TemplateFile[] = [
  { name: "polyclaw.json5", required: true },
  { name: "Dockerfile.extended", required: false },
  { name: ".env.example", required: true },
  { name: ".gitignore", required: false },
];

/**
 * Copy template files to target directory
 */
export function copyTemplates(targetDir: string): void {
  console.log(chalk.green("=== Initializing OpenClaw Docker setup ==="));

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  for (const file of TEMPLATE_FILES) {
    const src = join(TEMPLATES_DIR, file.name);
    const dest = join(targetDir, file.name);

    if (existsSync(dest)) {
      console.log(`  ${chalk.yellow("SKIP")} ${file.name} already exists`);
      continue;
    }

    if (!existsSync(src)) {
      if (file.required) {
        console.error(
          chalk.red(`  Error: Template file not found: ${file.name}`)
        );
      }
      continue;
    }

    copyFileSync(src, dest);
    console.log(`  ${chalk.green("OK")} ${file.name} created`);
  }

  // Rename .env.example to .env if .env doesn't exist
  const envExample = join(targetDir, ".env.example");
  const envFile = join(targetDir, ".env");
  if (existsSync(envExample) && !existsSync(envFile)) {
    copyFileSync(envExample, envFile);
    console.log(`  ${chalk.green("OK")} .env created from .env.example`);
  }

  console.log();
  console.log(chalk.yellow("Next steps:"));
  console.log("  1. Edit .env with your API keys");
  console.log("  2. Edit polyclaw.json5 to configure instances");
  console.log("  3. Run: npx polyclaw start");
}

/**
 * Create initial config for a new instance
 */
export function createInitialConfig(
  configDir: string,
  inst: InstanceConfig,
  defaultModel: string,
  globalConfig?: InfraConfig["config"]
): void {
  const configFile = join(configDir, "openclaw.json");
  if (existsSync(configFile)) {
    return; // Already exists, don't overwrite
  }

  const model = inst.config?.model || defaultModel;
  const token = inst.token || randomBytes(24).toString("hex");

  const initialConfig: Record<string, unknown> = {
    gateway: {
      mode: "local",
      bind: "lan",
      port: 18789,
      auth: {
        mode: "token",
        token: token,
      },
      controlUi: {
        allowInsecureAuth: true,
      },
    },
    agents: {
      defaults: {
        model: {
          primary: model,
        },
        workspace: "/home/node/.openclaw/workspace",
      },
    },
    hooks: {
      internal: {
        enabled: true,
        entries: {
          "command-logger": { enabled: true },
          "session-memory": { enabled: true },
        },
      },
    },
  };

  // Add tools config if defined
  if (globalConfig?.tools) {
    initialConfig.tools = globalConfig.tools;
  }

  writeFileSync(configFile, JSON.stringify(initialConfig, null, 2));
}

/**
 * Sync instance folders - create directories for each instance
 */
export function syncInstanceFolders(
  config: InfraConfig,
  paths: ConfigPaths
): void {
  console.log(chalk.green("=== Syncing instance folders ==="));

  const defaultModel =
    (getPath(config.config || {}, "agents.defaults.model.primary") as string) || DEFAULTS.model;

  for (const [name, inst] of Object.entries(config.instances)) {
    const dir = join(paths.instancesDir, name);
    const configDir = join(dir, "config");

    if (!existsSync(dir)) {
      console.log(`  ${chalk.yellow("Creating")} ${name}...`);
      mkdirSync(configDir, { recursive: true });
      mkdirSync(join(dir, "workspace"), { recursive: true });
      createInitialConfig(configDir, inst, defaultModel, config.config);
      console.log(chalk.dim(`         Initial config created`));
    } else {
      console.log(`  ${chalk.green("OK")} ${name} already exists`);
    }
  }

  console.log(chalk.green("Sync completed."));
}
