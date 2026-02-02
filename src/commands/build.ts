/**
 * build command - Build or rebuild the Docker image
 */

import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "../lib/config.js";
import { DEFAULTS } from "../lib/config.js";
import { findOpenclawRepo, buildImage } from "../lib/docker.js";

export function buildCommand(
  config: InfraConfig,
  paths: ConfigPaths,
  options: { openclawPath?: string } = {}
): void {
  const imageName = config.docker?.image || DEFAULTS.image;
  const repoPath = findOpenclawRepo(options.openclawPath);
  buildImage(imageName, repoPath);
}
