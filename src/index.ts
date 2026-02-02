/**
 * Polyclaw - Run multiple OpenClaw instances with Docker
 *
 * This module exports the core functionality for programmatic use.
 */

// Types
export type {
  InfraConfig,
  InstanceConfig,
  ConfigPaths,
} from "./lib/config.js";

// Config utilities
export {
  loadConfig,
  resolveConfigPaths,
  expandEnvVars,
  getPath,
  DEFAULTS,
} from "./lib/config.js";

// Compose utilities
export { generateComposeContent, generateComposeFile } from "./lib/compose.js";

// Docker utilities
export {
  isContainerRunning,
  readContainerConfig,
  execInContainer,
  dockerCompose,
  dockerComposeStream,
  getContainerStatus,
  imageExists,
  findOpenclawRepo,
  buildImage,
  ensureImage,
} from "./lib/docker.js";

// Template utilities
export {
  copyTemplates,
  createInitialConfig,
  syncInstanceFolders,
} from "./lib/templates.js";

// Validation utilities
export {
  validateOpenClawConfig,
  printValidationErrors,
  ensureOpenclawInstalled,
  type ValidationIssue,
  type ValidationResult,
} from "./lib/validate.js";

// Commands
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
