/**
 * Configuration loading and parsing for OpenClaw Docker infrastructure
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import JSON5 from "json5";
import chalk from "chalk";

// Types for configuration
export interface VolumeMount {
  host: string;
  container: string;
  mode?: "ro" | "rw"; // default: rw
}

export interface ServiceConfig {
  name: string;
  command: string;
  // Condition to check before starting (e.g., "file:/path/to/file")
  condition?: string;
}

export interface InstanceConfig {
  port: number;
  token?: string;
  // Per-instance config overrides (merged with global config)
  config?: Record<string, unknown>;
  // Extra volumes to mount
  volumes?: VolumeMount[];
}

// InfraConfig: polyclaw extensions + openclaw config passthrough
export interface DockerResources {
  limits?: { memory?: string };
  reservations?: { memory?: string };
}

export interface InfraConfig {
  // Polyclaw extensions
  project: string;
  instances: Record<string, InstanceConfig>;
  docker?: {
    image?: string;
    skills_path?: string;
    // Global volumes applied to all instances
    volumes?: VolumeMount[];
    // Local path to an existing openclaw repo (symlinked to ~/.polyclaw/openclaw)
    openclaw_path?: string;
    // Git URL for cloning openclaw (default: github.com/eternauta1337/openclaw)
    openclaw_repo?: string;
    // NODE_OPTIONS env var for all containers (e.g., "--max-old-space-size=512")
    node_options?: string;
    // Docker resource limits/reservations per container
    resources?: DockerResources;
    // Network mode: "isolated" (one network per instance) or "shared" (single network)
    network?: "isolated" | "shared";
  };
  // Project-level workspace files synced to all instances
  workspace?: {
    path?: string; // Default: "./workspace"
  };
  // Background services to run in containers (managed by pm2)
  services?: ServiceConfig[];
  // OpenClaw config - passed through directly to all instances
  config?: Record<string, unknown>;
}

// Default values for incomplete configs
export const DEFAULTS = {
  model: "anthropic/claude-sonnet-4-5",
  image: "openclaw:local",
  configFile: "polyclaw.json5",
};

/**
 * Parse a .env file and return key-value pairs.
 * Does not modify process.env.
 */
export function readEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};

  const content = readFileSync(filePath, "utf-8");
  const vars: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
    if (match) {
      vars[match[1]] = match[2];
    }
  }

  return vars;
}

/**
 * Expand environment variables in strings using an explicit env source.
 * Variables not found are kept as-is (for later expansion).
 */
export function expandEnvVars(value: unknown, env: Record<string, string | undefined>): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{(\w+)\}/g, (match, name) => {
      const val = env[name];
      return val !== undefined ? val : match;
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => expandEnvVars(v, env));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = expandEnvVars(v, env);
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
  if (!existsSync(paths.configFile)) {
    console.error(chalk.red(`Error: Configuration file not found: ${paths.configFile}`));
    process.exit(1);
  }

  // Read global env vars from .env/.env.shared (used for config expansion only)
  const sharedEnv = readEnvFile(join(paths.baseDir, ".env", ".env.shared"));

  const content = readFileSync(paths.configFile, "utf-8");
  const parsed = JSON5.parse(content);
  return expandEnvVars(parsed, sharedEnv) as InfraConfig;
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
