/**
 * build command - Build or rebuild the Docker image
 */
import { DEFAULTS } from "../lib/config.js";
import { findOpenclawRepo, buildImage } from "../lib/docker.js";
export function buildCommand(config, paths, options = {}) {
    const imageName = config.docker?.image || DEFAULTS.image;
    const repoPath = findOpenclawRepo(options.openclawPath);
    buildImage(imageName, repoPath);
}
//# sourceMappingURL=build.js.map