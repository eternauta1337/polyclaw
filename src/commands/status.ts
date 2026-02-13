/**
 * status command - Show infrastructure status
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "../lib/config.js";
import { DEFAULTS } from "../lib/config.js";
import { getContainerStatus } from "../lib/docker.js";

export function statusCommand(
  config: InfraConfig,
  paths: ConfigPaths
): void {
  const image = config.docker?.image || DEFAULTS.image;

  console.log(chalk.green("=== Infrastructure Status ==="));
  console.log();
  console.log(`  Project: ${chalk.bold(config.project)}`);
  console.log(`  Image:   ${chalk.dim(image)}`);
  console.log();

  // Instances table
  console.log("Instances:");
  for (const [name, inst] of Object.entries(config.instances)) {
    const dir = join(paths.instancesDir, name);
    const folderExists = existsSync(dir);
    const containerStatus = getContainerStatus(config.project, name);
    const envFile = join(paths.baseDir, ".env", `.env.${name}`);
    const hasEnv = existsSync(envFile);

    const folderIcon = folderExists ? chalk.green("●") : chalk.yellow("○");

    let containerIcon: string;
    let containerLabel: string;
    if (containerStatus.running) {
      containerIcon = chalk.green("●");
      containerLabel = chalk.green("running");
    } else if (containerStatus.status) {
      containerIcon = chalk.yellow("●");
      containerLabel = chalk.yellow(containerStatus.status);
    } else {
      containerIcon = chalk.dim("○");
      containerLabel = chalk.dim("not created");
    }

    const envIcon = hasEnv ? chalk.green("●") : chalk.yellow("○");

    console.log(
      `  ${containerIcon} ${chalk.bold(name.padEnd(12))} :${inst.port}  folder ${folderIcon}  env ${envIcon}  ${containerLabel}`
    );
  }

  console.log();

  // Files check
  const checks = [
    { file: paths.composeFile, name: "docker-compose.yml" },
    { file: join(paths.baseDir, ".env", ".env.shared"), name: ".env.shared" },
  ];

  console.log("Files:");
  for (const check of checks) {
    const icon = existsSync(check.file) ? chalk.green("●") : chalk.yellow("○");
    console.log(`  ${icon} ${check.name}`);
  }
}
