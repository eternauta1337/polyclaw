/**
 * start command - Sync folders, generate compose, and start containers
 */
import chalk from "chalk";
import { DEFAULTS } from "../lib/config.js";
import { generateComposeFile } from "../lib/compose.js";
import { dockerCompose, ensureImage } from "../lib/docker.js";
import { syncInstanceFolders } from "../lib/templates.js";
import { configureCommand } from "./configure.js";
export async function startCommand(config, paths, options = {}) {
    // Ensure Docker image exists
    const imageName = config.docker?.image || DEFAULTS.image;
    ensureImage(imageName, options.openclawPath);
    // Sync instance folders and configure
    syncInstanceFolders(config, paths);
    console.log();
    const ok = await configureCommand(config, paths);
    if (!ok) {
        process.exit(1);
    }
    console.log();
    // Generate docker-compose.yml
    generateComposeFile(config, paths);
    console.log();
    // Start containers
    console.log(chalk.green("=== Starting containers ==="));
    const args = ["up"];
    if (options.detach !== false) {
        args.push("-d");
    }
    if (options.recreate) {
        args.push("--force-recreate");
    }
    dockerCompose(args, paths);
    if (options.detach !== false) {
        console.log();
        console.log(chalk.green("Containers started in background."));
        console.log(chalk.yellow("Next steps:"));
        console.log("  - View logs: npx polyclaw logs");
        console.log("  - Check status: npx polyclaw status");
    }
}
//# sourceMappingURL=start.js.map