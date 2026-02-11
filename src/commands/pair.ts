/**
 * Pair command - Manage pairing codes for instances
 *
 * Usage:
 *   polyclaw pair [instance]                          # List pending requests (telegram)
 *   polyclaw pair [instance] <code>                   # Approve a code (telegram)
 *   polyclaw pair [instance] --channel whatsapp       # List pending requests (whatsapp)
 *   polyclaw pair [instance] <code> -ch whatsapp      # Approve a code (whatsapp)
 */

import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "../lib/config.js";
import { execInContainer, isContainerRunning } from "../lib/docker.js";

function resolveInstance(config: InfraConfig, instance?: string): string {
  const instances = Object.keys(config.instances || {});

  if (instances.length === 0) {
    console.error(chalk.red("No instances defined in config."));
    process.exit(1);
  }

  const target = instance || (instances.length === 1 ? instances[0] : null);

  if (!target) {
    console.error(chalk.red("Multiple instances available. Specify one:"));
    for (const name of instances) {
      console.error(`  - ${name}`);
    }
    process.exit(1);
  }

  if (!instances.includes(target)) {
    console.error(chalk.red(`Instance '${target}' not found.`));
    console.error("Available instances:");
    for (const name of instances) {
      console.error(`  - ${name}`);
    }
    process.exit(1);
  }

  return target;
}

function requireRunning(config: InfraConfig, instance: string): string {
  const containerName = `${config.project}-${instance}`;
  if (!isContainerRunning(containerName)) {
    console.error(chalk.red(`Container '${containerName}' is not running.`));
    console.error("Start it with: polyclaw start");
    process.exit(1);
  }
  return containerName;
}

export function pairCommand(
  config: InfraConfig,
  _paths: ConfigPaths,
  options: { instance?: string; code?: string; channel?: string },
): void {
  const instance = resolveInstance(config, options.instance);
  const container = requireRunning(config, instance);
  const channel = options.channel || "telegram";

  if (options.code) {
    console.log(
      chalk.green(
        `Approving ${channel} pairing code ${chalk.bold(options.code)} on ${instance}...`,
      ),
    );
    try {
      const result = execInContainer(
        container,
        `openclaw pairing approve ${channel} ${options.code} --notify`,
      );
      console.log(result.trim() || chalk.green("Done."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Failed to approve: ${msg}`));
      process.exit(1);
    }
  } else {
    console.log(
      chalk.green(`=== Pending ${channel} pairing requests for ${instance} ===\n`),
    );
    try {
      const result = execInContainer(
        container,
        `openclaw pairing list ${channel}`,
      );
      console.log(result.trim() || chalk.dim("No pending requests."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Failed to list: ${msg}`));
      process.exit(1);
    }
  }
}
