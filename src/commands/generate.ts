/**
 * generate command - Generate docker-compose.yml from configuration
 */

import type { ConfigPaths, InfraConfig } from "../lib/config.js";
import { generateComposeFile } from "../lib/compose.js";

export function generateCommand(
  config: InfraConfig,
  paths: ConfigPaths
): void {
  generateComposeFile(config, paths);
}
