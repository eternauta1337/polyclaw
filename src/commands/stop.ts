/**
 * stop command - Stop containers (single instance or all)
 */

import chalk from "chalk";
import type { ConfigPaths } from "../lib/config.js";
import { dockerCompose } from "../lib/docker.js";

export function stopCommand(paths: ConfigPaths, instance?: string): void {
  if (instance) {
    console.log(chalk.green(`=== Stopping ${instance} ===`));
    dockerCompose(["stop", instance], paths);
    console.log(chalk.green(`${instance} stopped.`));
  } else {
    console.log(chalk.green("=== Stopping all containers ==="));
    dockerCompose(["down"], paths);
    console.log(chalk.green("Containers stopped."));
  }
}
