/**
 * configure command - Write configuration files for instances
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "../lib/config.js";
import { DEFAULTS, expandEnvVars, readEnvFile } from "../lib/config.js";
import { syncWorkspaceFiles } from "../lib/templates.js";
import { validateOpenClawConfigs, printValidationErrors } from "../lib/validate.js";
import { findUnresolvedVars } from "../lib/validate-polyclaw-config.js";

/** Deep merge objects (b wins) */
function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const result = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = merge(
        (a[key] as Record<string, unknown>) || {},
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Write exec-approvals.json for an instance if configured */
function writeExecApprovals(
  instanceDir: string,
  globalApprovals: Record<string, unknown> | undefined,
  instanceApprovals: Record<string, unknown> | undefined,
): void {
  const approvalsFile = join(instanceDir, "exec-approvals.json");

  const isEmpty = (obj: Record<string, unknown> | undefined) =>
    !obj || Object.keys(obj).length === 0;

  if (isEmpty(globalApprovals) && isEmpty(instanceApprovals)) {
    if (existsSync(approvalsFile)) {
      rmSync(approvalsFile);
    }
    return;
  }

  // Merge global <- instance (instance wins)
  let final: Record<string, unknown> = {};
  if (globalApprovals) {
    final = merge({}, globalApprovals);
  }
  if (instanceApprovals) {
    final = merge(final, instanceApprovals);
  }

  writeFileSync(approvalsFile, JSON.stringify(final, null, 2));
}

/** Write per-agent workspace files for an instance */
function writeWorkspaceFiles(
  instanceDir: string,
  workspaceFiles: Record<string, Record<string, string>>,
): void {
  for (const [workspaceDir, files] of Object.entries(workspaceFiles)) {
    const targetDir = join(instanceDir, workspaceDir);
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    for (const [filename, content] of Object.entries(files)) {
      writeFileSync(join(targetDir, filename), content);
    }
  }
}

export async function configureCommand(config: InfraConfig, paths: ConfigPaths): Promise<boolean> {
  // Sync project-level workspace files before writing config
  syncWorkspaceFiles(config, paths);

  console.log(chalk.green("=== Configuring instances ==="));

  const imageName = config.docker?.image || DEFAULTS.image;
  let hasErrors = false;
  const baseConfig = {
    gateway: {
      mode: "local",
      bind: "lan",
      port: 18789,
      controlUi: { allowInsecureAuth: true },
    },
    agents: {},
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

  // Phase 1: build all final configs (merge + expand env vars)
  const builtConfigs = new Map<string, { final: Record<string, unknown>; configFile: string }>();

  for (const [name, inst] of Object.entries(config.instances)) {
    const instanceDir = join(paths.instancesDir, name);
    const configFile = join(instanceDir, "openclaw.json");

    // Ensure directory exists
    if (!existsSync(instanceDir)) {
      mkdirSync(instanceDir, { recursive: true });
    }

    // Preserve existing token if present
    let existingToken: string | undefined;
    if (existsSync(configFile)) {
      try {
        const existing = JSON.parse(readFileSync(configFile, "utf-8"));
        existingToken = existing?.gateway?.auth?.token;
      } catch {}
    }

    const token = inst.token || existingToken || randomBytes(24).toString("hex");

    // Merge: base <- global <- instance <- auth
    let final = merge(baseConfig, (config.config || {}) as Record<string, unknown>);
    final = merge(final, (inst.config || {}) as Record<string, unknown>);
    final = merge(final, { gateway: { auth: { mode: "token", token } } });

    // Expand remaining ${VAR} references using per-instance env file
    const instanceEnv = readEnvFile(join(paths.baseDir, ".env", `.env.${name}`));
    final = expandEnvVars(final, instanceEnv) as Record<string, unknown>;

    // Check: unresolved ${VAR} references
    const unresolvedIssues = findUnresolvedVars(final);
    if (unresolvedIssues.length > 0) {
      printValidationErrors(`${name} (unresolved vars)`, unresolvedIssues);
      hasErrors = true;
      continue;
    }

    builtConfigs.set(name, { final, configFile });
  }

  if (hasErrors) {
    console.log(chalk.red("\nConfiguration failed - fix errors above."));
    return false;
  }

  // Phase 2: validate all configs at once via a single docker run
  const configMap: Record<string, Record<string, unknown>> = {};
  for (const [name, { final }] of builtConfigs) {
    configMap[name] = final;
  }
  const validationResults = await validateOpenClawConfigs(configMap, imageName);

  // Phase 3: write configs
  for (const [name, { final, configFile }] of builtConfigs) {
    const validation = validationResults[name];
    if (!validation.ok) {
      printValidationErrors(name, validation.issues);
      hasErrors = true;
      continue;
    }
    const instanceDir = join(paths.instancesDir, name);
    const inst = config.instances[name];

    writeFileSync(configFile, JSON.stringify(final, null, 2));

    // Write exec-approvals.json if configured (global or per-instance)
    writeExecApprovals(instanceDir, config.execApprovals, inst.execApprovals);

    // Write per-agent workspace files if configured
    if (inst.workspaceFiles) {
      writeWorkspaceFiles(instanceDir, inst.workspaceFiles);
    }

    console.log(`  ${chalk.green("OK")} ${name}`);
  }

  if (hasErrors) {
    console.log(chalk.red("\nConfiguration failed - fix errors above."));
    return false;
  }

  console.log(chalk.green("Configuration completed."));
  return true;
}
