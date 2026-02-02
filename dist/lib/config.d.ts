/**
 * Configuration loading and parsing for OpenClaw Docker infrastructure
 */
export interface InstanceConfig {
    port: number;
    token?: string;
    config?: Record<string, unknown>;
}
export interface InfraConfig {
    project: string;
    instances: Record<string, InstanceConfig>;
    docker?: {
        image?: string;
        skills_path?: string;
    };
    config?: Record<string, unknown>;
}
export declare const DEFAULTS: {
    model: string;
    workspace: string;
    image: string;
    configFile: string;
};
/**
 * Expand environment variables in strings: ${VAR} -> process.env.VAR
 */
export declare function expandEnvVars(value: unknown): unknown;
export interface ConfigPaths {
    configFile: string;
    baseDir: string;
    instancesDir: string;
    composeFile: string;
}
/**
 * Resolve configuration paths based on config file location
 */
export declare function resolveConfigPaths(configPath?: string): ConfigPaths;
/**
 * Load and parse configuration from JSON5 file
 */
export declare function loadConfig(paths: ConfigPaths): InfraConfig;
/**
 * Get value from nested object path (e.g., "gateway.auth.token")
 */
export declare function getPath(obj: Record<string, unknown>, path: string): unknown;
//# sourceMappingURL=config.d.ts.map