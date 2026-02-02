/**
 * Config validation using OpenClaw's Zod schema
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import chalk from "chalk";
import type { ZodType } from "zod";

// Paths
const OPENCLAW_DIR = join(homedir(), ".polyclaw", "openclaw");
const SCHEMA_PATH = join(OPENCLAW_DIR, "dist", "config", "zod-schema.js");
const OPENCLAW_REPO = "https://github.com/openclaw/openclaw.git";

// Cache for loaded schema
let OpenClawSchema: ZodType | null = null;

/**
 * Ensure openclaw is installed and built at ~/.polyclaw/openclaw/
 */
export function ensureOpenclawInstalled(): boolean {
  const parentDir = join(homedir(), ".polyclaw");

  // Clone if not exists
  if (!existsSync(OPENCLAW_DIR)) {
    console.log(chalk.yellow("OpenClaw not found. Cloning..."));
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }
    try {
      execSync(`git clone --depth 1 ${OPENCLAW_REPO}`, {
        cwd: parentDir,
        stdio: "inherit",
      });
    } catch {
      console.error(chalk.red("Failed to clone openclaw repo"));
      return false;
    }
  }

  // Build if not built
  if (!existsSync(SCHEMA_PATH)) {
    console.log(chalk.yellow("Building OpenClaw..."));
    try {
      execSync("pnpm install && pnpm build", {
        cwd: OPENCLAW_DIR,
        stdio: "inherit",
      });
    } catch {
      console.error(chalk.red("Failed to build openclaw"));
      return false;
    }
  }

  return existsSync(SCHEMA_PATH);
}

async function loadSchema(): Promise<ZodType | null> {
  if (OpenClawSchema) return OpenClawSchema;

  if (!existsSync(SCHEMA_PATH)) {
    return null;
  }

  try {
    const mod = await import(SCHEMA_PATH);
    OpenClawSchema = mod.OpenClawSchema;
    return OpenClawSchema;
  } catch {
    return null;
  }
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate an OpenClaw config object against the schema
 */
export async function validateOpenClawConfig(
  config: Record<string, unknown>
): Promise<ValidationResult> {
  let schema = await loadSchema();

  // Try to install/build openclaw if schema not found
  if (!schema) {
    if (ensureOpenclawInstalled()) {
      schema = await loadSchema();
    }
  }

  if (!schema) {
    // Schema still not available - skip validation
    console.warn(chalk.yellow("  Warning: Config validation skipped (openclaw not available)"));
    return { ok: true, issues: [] };
  }

  const result = schema.safeParse(config);

  if (result.success) {
    return { ok: true, issues: [] };
  }

  return {
    ok: false,
    issues: result.error.issues.map((iss) => ({
      path: iss.path.join(".") || "<root>",
      message: iss.message,
    })),
  };
}

/**
 * Print validation errors to console
 */
export function printValidationErrors(
  context: string,
  issues: ValidationIssue[]
): void {
  console.error(chalk.red(`\n  Validation errors in ${context}:`));
  for (const issue of issues) {
    console.error(chalk.red(`    - ${issue.path}: ${issue.message}`));
  }
}
