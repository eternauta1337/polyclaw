/**
 * Config validation using OpenClaw's Zod schema
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import type { ZodType } from "zod";

// Path to schema (if openclaw is built locally)
const SCHEMA_PATH = join(homedir(), ".polyclaw", "openclaw", "dist", "config", "zod-schema.js");

// Cache for loaded schema
let OpenClawSchema: ZodType | null = null;

/**
 * Check if openclaw schema is available (without trying to build it)
 */
export function isSchemaAvailable(): boolean {
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
