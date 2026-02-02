/**
 * Template file management
 */
import type { ConfigPaths, InfraConfig, InstanceConfig } from "./config.js";
export interface TemplateFile {
    name: string;
    required: boolean;
}
/**
 * Copy template files to target directory
 */
export declare function copyTemplates(targetDir: string): void;
/**
 * Create initial config for a new instance
 */
export declare function createInitialConfig(configDir: string, inst: InstanceConfig, defaultModel: string, globalConfig?: InfraConfig["config"]): void;
/**
 * Sync instance folders - create directories for each instance
 */
export declare function syncInstanceFolders(config: InfraConfig, paths: ConfigPaths): void;
//# sourceMappingURL=templates.d.ts.map