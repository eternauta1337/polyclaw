/**
 * Configuration loading and parsing for OpenClaw Docker infrastructure
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import JSON5 from "json5";
import { config as loadDotenv } from "dotenv";
import chalk from "chalk";

// Types for configuration
export interface InstanceConfig {
  port: number;
  token?: string;
  // Per-instance config overrides (merged with global config)
  config?: Record<string, unknown>;
}

// InfraConfig: polyclaw extensions + openclaw config passthrough
export interface InfraConfig {
  // Polyclaw extensions
  project: string;
  instances: Record<string, InstanceConfig>;
  docker?: {
    image?: string;
    skills_path?: string;
  };
  // OpenClaw config - passed through directly to all instances
  config?: Record<string, unknown>;
}

// Default values for incomplete configs
export const DEFAULTS = {
  model: "anthropic/claude-sonnet-4-5",
  workspace: "/home/node/.openclaw/workspace",
  image: "openclaw:local",
  configFile: "polyclaw.json5",
};

/**
 * Expand environment variables in strings: ${VAR} -> process.env.VAR
 */
export function expandEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || "");
  }
  if (Array.isArray(value)) {
    return value.map(expandEnvVars);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = expandEnvVars(v);
    }
    return result;
  }
  return value;
}

export interface ConfigPaths {
  configFile: string;
  baseDir: string;
  instancesDir: string;
  composeFile: string;
}

/**
 * Resolve configuration paths based on config file location
 */
export function resolveConfigPaths(configPath?: string): ConfigPaths {
  const configFile = configPath
    ? resolve(configPath)
    : join(process.cwd(), DEFAULTS.configFile);

  const baseDir = dirname(configFile);

  return {
    configFile,
    baseDir,
    instancesDir: join(baseDir, "instances"),
    composeFile: join(baseDir, "docker-compose.yml"),
  };
}

/**
 * Load and parse configuration from JSON5 file
 */
export function loadConfig(paths: ConfigPaths): InfraConfig {
  // Load .env from the config directory
  loadDotenv({ path: join(paths.baseDir, ".env") });

  if (!existsSync(paths.configFile)) {
    console.error(chalk.red(`Error: Configuration file not found: ${paths.configFile}`));
    process.exit(1);
  }

  const content = readFileSync(paths.configFile, "utf-8");
  const parsed = JSON5.parse(content);
  return expandEnvVars(parsed) as InfraConfig;
}

/**
 * Get value from nested object path (e.g., "gateway.auth.token")
 */
export function getPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
