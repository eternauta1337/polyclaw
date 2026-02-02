/**
 * Docker Compose file generation
 */
import type { ConfigPaths, InfraConfig } from "./config.js";
/**
 * Generate docker-compose.yml content from configuration
 */
export declare function generateComposeContent(config: InfraConfig, baseDir: string): string;
/**
 * Generate and write docker-compose.yml file
 */
export declare function generateComposeFile(config: InfraConfig, paths: ConfigPaths): void;
//# sourceMappingURL=compose.d.ts.map