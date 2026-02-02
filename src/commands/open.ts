/**
 * open command - Open the web UI in browser
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "../lib/config.js";

export function openCommand(
  config: InfraConfig,
  paths: ConfigPaths,
  instanceName?: string
): void {
  // Default to first instance if not specified
  const instances = Object.keys(config.instances);
  const name = instanceName || instances[0];

  if (!config.instances[name]) {
    console.error(chalk.red(`Instance "${name}" not found`));
    console.error(chalk.dim(`Available: ${instances.join(", ")}`));
    process.exit(1);
  }

  const inst = config.instances[name];
  const configFile = join(paths.instancesDir, name, "config", "openclaw.json");

  if (!existsSync(configFile)) {
    console.error(chalk.red(`Config not found: ${configFile}`));
    console.error(chalk.dim(`Run 'polyclaw start' first`));
    process.exit(1);
  }

  // Read token from instance config
  const instanceConfig = JSON.parse(readFileSync(configFile, "utf-8"));
  const token = instanceConfig?.gateway?.auth?.token;

  if (!token) {
    console.error(chalk.red(`Token not found in ${configFile}`));
    process.exit(1);
  }

  const url = `http://localhost:${inst.port}/?token=${token}`;
  console.log(chalk.green(`Opening ${name}...`));
  console.log(chalk.dim(url));

  // Open in browser (macOS)
  execSync(`open "${url}"`);
}
