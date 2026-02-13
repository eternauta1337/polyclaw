/**
 * build command - Build or rebuild the Docker image
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "../lib/config.js";
import { DEFAULTS } from "../lib/config.js";
import { findOpenclawRepo, buildImage, buildExtendedImage, buildPolyclawBase } from "../lib/docker.js";

export async function buildCommand(
  config: InfraConfig,
  paths: ConfigPaths,
  options: { openclawPath?: string } = {}
): Promise<void> {
  const imageName = config.docker?.image || DEFAULTS.image;
  const repoPath = await findOpenclawRepo(options.openclawPath, config.docker);

  // Check if there's a Dockerfile.extended
  const hasExtended = existsSync(join(paths.baseDir, "Dockerfile.extended"));

  if (hasExtended && imageName !== DEFAULTS.image) {
    // Build full chain: openclaw:local -> polyclaw:base -> extended
    console.log(chalk.dim(`Building base image first (${DEFAULTS.image})...`));
    buildImage(DEFAULTS.image, repoPath);
    console.log();
    // Always rebuild polyclaw:base so it picks up changes from openclaw:local
    buildPolyclawBase();
    console.log();
    buildExtendedImage(imageName, paths.baseDir);
  } else {
    // Just build the requested image
    buildImage(imageName, repoPath);
  }
}
