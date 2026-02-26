/**
 * Template file management
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
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

/** Read the agents list from global config. */
function getAgentsList(
  config: InfraConfig,
): Array<{ id: string; default?: boolean }> {
  return (
    (getPath(config.config || {}, "agents.list") as
      | Array<{ id: string; default?: boolean }>
      | undefined) ?? []
  );
}

/**
 * Return workspace directories for an instance.
 * All workspaces live at instances/{name}/workspace-{agentId}/.
 * Creates dirs if they don't exist.
 */
function getInstanceWorkspaceDirs(
  instanceDir: string,
  agents: Array<{ id: string }>,
): string[] {
  const dirs: string[] = [];
  for (const agent of agents) {
    const dir = join(instanceDir, `workspace-${agent.id}`);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    dirs.push(dir);
  }
  return dirs;
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
  const agents = getAgentsList(config);

  for (const [name, inst] of Object.entries(config.instances)) {
    const dir = join(paths.instancesDir, name);

    if (!existsSync(dir)) {
      console.log(`  ${chalk.yellow("Creating")} ${name}...`);
      mkdirSync(dir, { recursive: true });
      createInitialConfig(dir, inst, defaultModel, config.config);
      console.log(chalk.dim(`         Initial config created`));
    } else {
      console.log(`  ${chalk.green("OK")} ${name} already exists`);
    }

    // Ensure workspace dirs exist for each agent
    getInstanceWorkspaceDirs(dir, agents);

    // Write or clean up services.json
    const servicesFile = join(dir, "services.json");
    if (config.services && config.services.length > 0) {
      writeFileSync(servicesFile, JSON.stringify(config.services, null, 2));
    } else if (existsSync(servicesFile)) {
      rmSync(servicesFile);
    }
  }

  console.log(chalk.green("Sync completed."));
}

const MOTHER_BLOCK_RE = /<mother>\n?([\s\S]*?)\n?<\/mother>/;

/**
 * Sync a single workspace file to a target path.
 *
 * If the source contains a <mother>...</mother> block:
 *   - Target doesn't exist → copy the full source (seeds template + mother block)
 *   - Target exists with <mother> block → replace only the <mother> block, preserve user content
 *   - Target exists without <mother> block → overwrite entirely (migration from old format)
 *
 * If the source has no <mother> block: always copy entirely (legacy behavior).
 */
function syncWorkspaceFile(sourcePath: string, targetPath: string): void {
  const sourceContent = readFileSync(sourcePath, "utf-8");
  const sourceMatch = sourceContent.match(MOTHER_BLOCK_RE);

  if (!sourceMatch) {
    // No <mother> block in source — legacy full-copy behavior
    copyFileSync(sourcePath, targetPath);
    return;
  }

  if (!existsSync(targetPath)) {
    // New instance — seed the full template
    writeFileSync(targetPath, sourceContent, "utf-8");
    return;
  }

  const targetContent = readFileSync(targetPath, "utf-8");

  if (MOTHER_BLOCK_RE.test(targetContent)) {
    // Target has a <mother> block — replace only that section
    const updated = targetContent.replace(MOTHER_BLOCK_RE, sourceMatch[0]);
    writeFileSync(targetPath, updated, "utf-8");
  } else {
    // Target exists but has no <mother> block — migration: overwrite entirely
    writeFileSync(targetPath, sourceContent, "utf-8");
  }
}

/**
 * Sync project-level workspace files to all instance workspaces.
 *
 * Files with <mother>...</mother> blocks get smart-merged: only the deployer
 * section is updated, preserving user/agent content outside the tags.
 * Files without <mother> blocks are copied entirely (legacy behavior).
 */
export function syncWorkspaceFiles(
  config: InfraConfig,
  paths: ConfigPaths,
): void {
  const workspacePath = config.workspace?.path || "./workspace";
  const projectWorkspaceDir = join(paths.baseDir, workspacePath);

  if (!existsSync(projectWorkspaceDir)) {
    return;
  }

  const files = readdirSync(projectWorkspaceDir).filter(
    (f) => !f.startsWith("."),
  );
  if (files.length === 0) {
    return;
  }

  console.log(chalk.green("=== Syncing workspace files ==="));
  console.log(chalk.dim(`  Source: ${workspacePath}/ (${files.join(", ")})`));

  const agents = getAgentsList(config);

  for (const name of Object.keys(config.instances)) {
    const instanceDir = join(paths.instancesDir, name);
    const workspaceDirs = getInstanceWorkspaceDirs(instanceDir, agents);

    for (const dir of workspaceDirs) {
      for (const file of files) {
        syncWorkspaceFile(join(projectWorkspaceDir, file), join(dir, file));
      }
    }

    console.log(
      `  ${chalk.green("OK")} ${name} (${workspaceDirs.length} workspace${workspaceDirs.length !== 1 ? "s" : ""})`,
    );
  }
}
