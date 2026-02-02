/**
 * Polyclaw - Run multiple OpenClaw instances with Docker
 *
 * This module exports the core functionality for programmatic use.
 */
export type { InfraConfig, InstanceConfig, ConfigPaths, } from "./lib/config.js";
export { loadConfig, resolveConfigPaths, expandEnvVars, getPath, DEFAULTS, } from "./lib/config.js";
export { generateComposeContent, generateComposeFile } from "./lib/compose.js";
export { isContainerRunning, readContainerConfig, execInContainer, dockerCompose, dockerComposeStream, getContainerStatus, imageExists, findOpenclawRepo, buildImage, ensureImage, } from "./lib/docker.js";
export { copyTemplates, createInitialConfig, syncInstanceFolders, } from "./lib/templates.js";
export { validateOpenClawConfig, printValidationErrors, ensureOpenclawInstalled, type ValidationIssue, type ValidationResult, } from "./lib/validate.js";
export { initCommand } from "./commands/init.js";
export { generateCommand } from "./commands/generate.js";
export { startCommand } from "./commands/start.js";
export { stopCommand } from "./commands/stop.js";
export { logsCommand } from "./commands/logs.js";
export { statusCommand } from "./commands/status.js";
export { configureCommand } from "./commands/configure.js";
export { openCommand } from "./commands/open.js";
export { buildCommand } from "./commands/build.js";
export { shellCommand } from "./commands/shell.js";
//# sourceMappingURL=index.d.ts.map