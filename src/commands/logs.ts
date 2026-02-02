/**
 * logs command - View container logs
 */

import type { ConfigPaths } from "../lib/config.js";
import { dockerCompose } from "../lib/docker.js";

export interface LogsOptions {
  follow?: boolean;
  tail?: string;
  service?: string;
}

export function logsCommand(
  paths: ConfigPaths,
  options: LogsOptions = {}
): void {
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
