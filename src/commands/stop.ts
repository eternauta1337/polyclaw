/**
 * stop command - Stop and remove containers
 */

import chalk from "chalk";
import type { ConfigPaths } from "../lib/config.js";
import { dockerCompose } from "../lib/docker.js";

export function stopCommand(paths: ConfigPaths): void {
  console.log(chalk.green("=== Stopping containers ==="));
  dockerCompose(["down"], paths);
  console.log(chalk.green("Containers stopped."));
}
