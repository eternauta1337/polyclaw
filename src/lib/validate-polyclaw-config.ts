/**
 * Polyclaw-level config validation (independent of OpenClaw's Zod schema)
 */

import type { ValidationIssue } from "./validate.js";

/**
 * Recursively scan a config object for unresolved ${VAR} references.
 * Runs on the final merged config after all env expansion — any remaining
 * ${...} pattern means a variable was not defined in the env files.
 */
export function findUnresolvedVars(obj: unknown, path: string[] = []): ValidationIssue[] {
  if (typeof obj === "string") {
    const matches = [...obj.matchAll(/\$\{([^}]+)\}/g)];
    return matches.map((m) => ({
      path: path.join(".") || "<root>",
      message: `Unresolved variable: ${m[0]}`,
    }));
  }
  if (Array.isArray(obj)) {
    return obj.flatMap((v, i) => findUnresolvedVars(v, [...path, String(i)]));
  }
  if (obj !== null && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      findUnresolvedVars(v, [...path, k])
    );
  }
  return [];
}
