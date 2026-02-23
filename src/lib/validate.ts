/**
 * Config validation using OpenClaw's Zod schema (via docker run)
 *
 * Instead of extracting the schema to the host, we run a single Docker
 * container that validates all configs using OpenClaw's own tsx-based tooling.
 */

import { execSync } from "node:child_process";
import chalk from "chalk";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  /** true when validation was skipped (Docker unavailable or image not found) */
  skipped?: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate multiple OpenClaw configs at once by running a single Docker container.
 * Uses OpenClaw's own tsx + zod-schema.ts for validation.
 *
 * Returns skipped results (ok: true, skipped: true) if Docker/image is unavailable.
 */
export async function validateOpenClawConfigs(
  configs: Record<string, Record<string, unknown>>,
  imageName: string
): Promise<Record<string, ValidationResult>> {
  const names = Object.keys(configs);
  if (names.length === 0) return {};

  const configArray = names.map((n) => configs[n]);

  // Script runs inside the container (Node 22 + tsx available).
  // Reads configs embedded inline, validates via OpenClaw's own schema,
  // writes JSON results to stdout.
  const script = `
import { OpenClawSchema } from '/app/src/config/zod-schema.ts';
const configs = ${JSON.stringify(configArray)};
const results = configs.map((config) => {
  const r = OpenClawSchema.safeParse(config);
  if (r.success) return { ok: true, issues: [] };
  return {
    ok: false,
    issues: r.error.issues.map((i) => ({
      path: i.path.join('.') || '<root>',
      message: i.message,
    })),
  };
});
process.stdout.write(JSON.stringify(results));
`;

  try {
    // Write script to a temp file inside the container then run with tsx.
    // tsx is a devDependency of openclaw, installed at /app/node_modules/.bin/tsx.
    const output = execSync(
      `docker run --rm -i "${imageName}" sh -c "cat > /tmp/pc-validate.mts && /app/node_modules/.bin/tsx /tmp/pc-validate.mts"`,
      { input: script, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const results: ValidationResult[] = JSON.parse(output);
    const mapped: Record<string, ValidationResult> = {};
    names.forEach((name, i) => (mapped[name] = results[i]));
    return mapped;
  } catch (err: any) {
    const stderr = err?.stderr?.toString?.()?.trim() || err?.message || "unknown error";
    console.error(chalk.red(`\n  Schema validation failed:`));
    console.error(chalk.red(`  ${stderr}`));
    console.error(chalk.dim(`  Ensure Docker is running and image "${imageName}" exists ('polyclaw build')`));
    process.exit(1);
  }
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
