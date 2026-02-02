/**
 * Configuration loading and parsing for OpenClaw Docker infrastructure
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import JSON5 from "json5";
import { config as loadDotenv } from "dotenv";
import chalk from "chalk";
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
export function expandEnvVars(value) {
    if (typeof value === "string") {
        return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || "");
    }
    if (Array.isArray(value)) {
        return value.map(expandEnvVars);
    }
    if (value && typeof value === "object") {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = expandEnvVars(v);
        }
        return result;
    }
    return value;
}
/**
 * Resolve configuration paths based on config file location
 */
export function resolveConfigPaths(configPath) {
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
export function loadConfig(paths) {
    // Load .env from the config directory
    loadDotenv({ path: join(paths.baseDir, ".env") });
    if (!existsSync(paths.configFile)) {
        console.error(chalk.red(`Error: Configuration file not found: ${paths.configFile}`));
        process.exit(1);
    }
    const content = readFileSync(paths.configFile, "utf-8");
    const parsed = JSON5.parse(content);
    return expandEnvVars(parsed);
}
/**
 * Get value from nested object path (e.g., "gateway.auth.token")
 */
export function getPath(obj, path) {
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== "object") {
            return undefined;
        }
        current = current[part];
    }
    return current;
}
//# sourceMappingURL=config.js.map