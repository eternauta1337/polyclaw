/**
 * Shell command - Enter an interactive shell in a container
 */

import { spawnSync } from "node:child_process";
import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "../lib/config.js";
import { isContainerRunning } from "../lib/docker.js";

export function shellCommand(
  config: InfraConfig,
  paths: ConfigPaths,
  instance?: string
): void {
  const instances = Object.keys(config.instances || {});

  if (instances.length === 0) {
    console.error(chalk.red("No instances defined in config."));
    process.exit(1);
  }

  // If no instance specified and only one exists, use it
  const targetInstance = instance || (instances.length === 1 ? instances[0] : null);

  if (!targetInstance) {
    console.error(chalk.red("Multiple instances available. Specify one:"));
    for (const name of instances) {
      console.error(`  - ${name}`);
    }
    process.exit(1);
  }

  if (!instances.includes(targetInstance)) {
    console.error(chalk.red(`Instance '${targetInstance}' not found.`));
    console.error("Available instances:");
    for (const name of instances) {
      console.error(`  - ${name}`);
    }
    process.exit(1);
  }

  const containerName = `${config.project}-${targetInstance}`;

  if (!isContainerRunning(containerName)) {
    console.error(chalk.red(`Container '${containerName}' is not running.`));
    console.error("Start it with: npx polyclaw start");
    process.exit(1);
  }

  console.log(chalk.green(`Entering shell in ${containerName}...`));

  // Use spawn with inherit to get interactive TTY
  const result = spawnSync("docker", ["exec", "-it", containerName, "bash"], {
    stdio: "inherit",
  });

  process.exit(result.status || 0);
}
