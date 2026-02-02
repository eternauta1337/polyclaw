/**
 * Docker command execution wrappers
 */
import type { ConfigPaths } from "./config.js";
export interface DockerExecOptions {
    cwd?: string;
    stdio?: "inherit" | "pipe";
}
/**
 * Check if a Docker container is running
 */
export declare function isContainerRunning(containerName: string): boolean;
/**
 * Read config from a running container
 */
export declare function readContainerConfig(containerName: string): Record<string, unknown> | null;
/**
 * Execute a command in a container
 */
export declare function execInContainer(containerName: string, command: string, options?: DockerExecOptions): string;
/**
 * Run docker compose command
 */
export declare function dockerCompose(args: string[], paths: ConfigPaths, options?: DockerExecOptions): void;
/**
 * Run docker compose command with streaming output
 */
export declare function dockerComposeStream(args: string[], paths: ConfigPaths): Promise<number>;
/**
 * Check if a Docker image exists locally
 */
export declare function imageExists(imageName: string): boolean;
/**
 * Find or clone the openclaw repository
 */
export declare function findOpenclawRepo(customPath?: string): string;
/**
 * Build the openclaw Docker image
 */
export declare function buildImage(imageName: string, openclawPath: string): void;
/**
 * Ensure the Docker image exists, building it if necessary
 */
export declare function ensureImage(imageName: string, openclawPath?: string): void;
/**
 * Get container status information
 */
export declare function getContainerStatus(project: string, instanceName: string): {
    running: boolean;
    status?: string;
};
//# sourceMappingURL=docker.d.ts.map