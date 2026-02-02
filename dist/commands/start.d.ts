/**
 * start command - Sync folders, generate compose, and start containers
 */
import type { ConfigPaths, InfraConfig } from "../lib/config.js";
export declare function startCommand(config: InfraConfig, paths: ConfigPaths, options?: {
    detach?: boolean;
    openclawPath?: string;
    recreate?: boolean;
}): Promise<void>;
//# sourceMappingURL=start.d.ts.map