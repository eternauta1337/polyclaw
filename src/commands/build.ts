/**
 * build command - Build or rebuild the Docker image
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "../lib/config.js";
import { DEFAULTS } from "../lib/config.js";
import { findOpenclawRepo, buildImage, buildExtendedImage } from "../lib/docker.js";

export function buildCommand(
  config: InfraConfig,
  paths: ConfigPaths,
  options: { openclawPath?: string } = {}
): void {
  const imageName = config.docker?.image || DEFAULTS.image;
  const repoPath = findOpenclawRepo(options.openclawPath);

  // Check if there's a Dockerfile.extended
  const hasExtended = existsSync(join(paths.baseDir, "Dockerfile.extended"));

  if (hasExtended && imageName !== DEFAULTS.image) {
    // Build base image first, then extended
    console.log(chalk.dim(`Building base image first (${DEFAULTS.image})...`));
    buildImage(DEFAULTS.image, repoPath);
    console.log();
    buildExtendedImage(imageName, paths.baseDir);
  } else {
    // Just build the requested image
    buildImage(imageName, repoPath);
  }
}
