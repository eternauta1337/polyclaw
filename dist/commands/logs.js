/**
 * logs command - View container logs
 */
import { dockerCompose } from "../lib/docker.js";
export function logsCommand(paths, options = {}) {
    const args = ["logs"];
    if (options.follow) {
        args.push("-f");
    }
    if (options.tail) {
        args.push("--tail", options.tail);
    }
    if (options.service) {
        args.push(options.service);
    }
    dockerCompose(args, paths);
}
//# sourceMappingURL=logs.js.map