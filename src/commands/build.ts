/**
 * build command - Build or rebuild the Docker image
 */

import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "../lib/config.js";
import { DEFAULTS } from "../lib/config.js";
import { findOpenclawRepo, buildImage, buildExtendedImage, buildPolyclawBase } from "../lib/docker.js";

export async function buildCommand(
  config: InfraConfig,
  paths: ConfigPaths,
  options: { openclawPath?: string; noCache?: boolean } = {}
): Promise<void> {
  const imageName = config.docker?.image || DEFAULTS.image;
  const repoPath = await findOpenclawRepo(options.openclawPath, config.docker);
  const noCache = options.noCache ?? false;

  // Check if there's a Dockerfile.extended
  const hasExtended = existsSync(join(paths.baseDir, "Dockerfile.extended"));

  if (hasExtended && imageName !== DEFAULTS.image) {
    // Build full chain: openclaw:local -> polyclaw:base -> extended
    console.log(chalk.dim(`Building base image first (${DEFAULTS.image})...`));
    buildImage(DEFAULTS.image, repoPath, { noCache });
    console.log();
    // Always rebuild polyclaw:base so it picks up changes from openclaw:local
    buildPolyclawBase();
    console.log();
    buildExtendedImage(imageName, paths.baseDir);
  } else {
    // Just build the requested image
    buildImage(imageName, repoPath, { noCache });
  }

  // Clean up dangling images left over from the build
  console.log(chalk.dim("\nCleaning up dangling images..."));
  execSync("docker image prune -f", { stdio: "inherit", encoding: "utf-8" });
}
