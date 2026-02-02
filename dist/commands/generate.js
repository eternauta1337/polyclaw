/**
 * generate command - Generate docker-compose.yml from configuration
 */
import { generateComposeFile } from "../lib/compose.js";
export function generateCommand(config, paths) {
    generateComposeFile(config, paths);
}
//# sourceMappingURL=generate.js.map