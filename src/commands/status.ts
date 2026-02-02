/**
 * status command - Show infrastructure status
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "../lib/config.js";
import { getContainerStatus } from "../lib/docker.js";

export function statusCommand(
  config: InfraConfig,
  paths: ConfigPaths
): void {
  console.log(chalk.green("=== Infrastructure Status ==="));
  console.log();
  console.log(`Project: ${chalk.yellow(config.project)}`);
  console.log();

  console.log("Instances:");
  for (const [name, inst] of Object.entries(config.instances)) {
    const dir = join(paths.instancesDir, name);
    const folderExists = existsSync(dir);
    const containerStatus = getContainerStatus(config.project, name);

    const folderStatus = folderExists
      ? chalk.green("exists")
      : chalk.yellow("missing");

    let runningStatus: string;
    if (containerStatus.running) {
      runningStatus = chalk.green("running");
    } else if (containerStatus.status) {
      runningStatus = chalk.yellow(containerStatus.status);
    } else {
      runningStatus = chalk.dim("not created");
    }

    console.log(
      `  ${chalk.bold(name)}: port ${inst.port} | folder: ${folderStatus} | container: ${runningStatus}`
    );
  }

  console.log();

  // Check for required files
  const checks = [
    { file: paths.composeFile, name: "docker-compose.yml" },
    { file: join(paths.baseDir, ".env"), name: ".env" },
  ];

  console.log("Files:");
  for (const check of checks) {
    const status = existsSync(check.file)
      ? chalk.green("exists")
      : chalk.yellow("missing");
    console.log(`  ${check.name}: ${status}`);
  }
}
