/**
 * stop command - Stop and remove containers
 */
import chalk from "chalk";
import { dockerCompose } from "../lib/docker.js";
export function stopCommand(paths) {
    console.log(chalk.green("=== Stopping containers ==="));
    dockerCompose(["down"], paths);
    console.log(chalk.green("Containers stopped."));
}
//# sourceMappingURL=stop.js.map