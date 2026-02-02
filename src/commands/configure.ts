/**
 * configure command - Write configuration files for instances
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "../lib/config.js";
import { DEFAULTS } from "../lib/config.js";
import { validateOpenClawConfig, printValidationErrors } from "../lib/validate.js";

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

export async function configureCommand(config: InfraConfig, paths: ConfigPaths): Promise<boolean> {
  console.log(chalk.green("=== Configuring instances ==="));

  let hasErrors = false;
  const baseConfig = {
    gateway: {
      mode: "local",
      bind: "lan",
      port: 18789,
      controlUi: { allowInsecureAuth: true },
    },
    agents: {
      defaults: { workspace: DEFAULTS.workspace },
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

  for (const [name, inst] of Object.entries(config.instances)) {
    const configDir = join(paths.instancesDir, name, "config");
    const configFile = join(configDir, "openclaw.json");

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
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

    // Validate before writing
    const validation = await validateOpenClawConfig(final);
    if (!validation.ok) {
      printValidationErrors(name, validation.issues);
      hasErrors = true;
      continue;
    }

    writeFileSync(configFile, JSON.stringify(final, null, 2));
    console.log(`  ${chalk.green("OK")} ${name}`);
  }

  if (hasErrors) {
    console.log(chalk.red("\nConfiguration failed - fix errors above."));
    return false;
  }

  console.log(chalk.green("Configuration completed."));
  return true;
}
