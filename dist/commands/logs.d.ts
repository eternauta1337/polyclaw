/**
 * logs command - View container logs
 */
import type { ConfigPaths } from "../lib/config.js";
export interface LogsOptions {
    follow?: boolean;
    tail?: string;
    service?: string;
}
export declare function logsCommand(paths: ConfigPaths, options?: LogsOptions): void;
//# sourceMappingURL=logs.d.ts.map