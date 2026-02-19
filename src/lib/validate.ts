/**
 * Config validation using OpenClaw's Zod schema
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import type { ZodType } from "zod";

const POLYCLAW_HOME = join(homedir(), ".polyclaw");
const GLOBAL_CONFIG_PATH = join(POLYCLAW_HOME, "config.json");

/**
 * Find the openclaw schema path, checking multiple locations:
 * 1. ~/.polyclaw/openclaw/dist/config/zod-schema.js (symlink or real dir)
 * 2. Configured openclawPath in ~/.polyclaw/config.json
 */
function getSchemaPath(): string {
  const symlinkSchema = join(POLYCLAW_HOME, "openclaw", "dist", "config", "zod-schema.js");
  if (existsSync(symlinkSchema)) return symlinkSchema;

  try {
    const config = JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf-8"));
    if (config.openclawPath) {
      return join(config.openclawPath, "dist", "config", "zod-schema.js");
    }
  } catch {
    // ignore
  }

  return symlinkSchema; // default (even if doesn't exist — caller checks existsSync)
}

// Cache for loaded schema
let OpenClawSchema: ZodType | null = null;

/**
 * Check if openclaw schema is available (without trying to build it)
 */
export function isSchemaAvailable(): boolean {
  return existsSync(getSchemaPath());
}

async function loadSchema(): Promise<ZodType | null> {
  if (OpenClawSchema) return OpenClawSchema;

  const schemaPath = getSchemaPath();
  if (!existsSync(schemaPath)) {
    return null;
  }

  try {
    const mod = await import(schemaPath);
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
  /** true when the schema was not available and validation was skipped */
  skipped?: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate an OpenClaw config object against the schema
 */
export async function validateOpenClawConfig(
  config: Record<string, unknown>
): Promise<ValidationResult> {
  const schema = await loadSchema();

  if (!schema) {
    // Schema not available - skip validation (don't try to build, that's slow)
    return { ok: true, skipped: true, issues: [] };
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
