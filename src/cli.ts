#!/usr/bin/env node

/**
 * Polyclaw CLI - Run multiple OpenClaw instances with Docker
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, resolveConfigPaths } from "./lib/config.js";
import { requireDocker } from "./lib/docker.js";
import { initCommand } from "./commands/init.js";
import { generateCommand } from "./commands/generate.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { logsCommand } from "./commands/logs.js";
import { statusCommand } from "./commands/status.js";
import { configureCommand } from "./commands/configure.js";
import { openCommand } from "./commands/open.js";
import { buildCommand } from "./commands/build.js";
import { shellCommand } from "./commands/shell.js";
import { pairCommand } from "./commands/pair.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));

const program = new Command();

program
  .name("polyclaw")
  .description("Run multiple OpenClaw instances with Docker")
  .version(pkg.version);

// Global option for config file
program.option(
  "-c, --config <path>",
  "Path to polyclaw.json5 config file"
);

// init command - doesn't need config
program
  .command("init")
  .description("Initialize OpenClaw Docker setup in current directory")
  .action(() => {
    initCommand();
  });

// Helper to load config for commands that need it
function withConfig(
  action: (
    config: ReturnType<typeof loadConfig>,
    paths: ReturnType<typeof resolveConfigPaths>
  ) => void | Promise<unknown>
) {
  return async () => {
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);

    if (!existsSync(paths.configFile)) {
      console.error(`Error: Config file not found: ${paths.configFile}`);
      console.error("Run 'npx polyclaw init' to create one.");
      process.exit(1);
    }

    const config = loadConfig(paths);
    await action(config, paths);
  };
}

// start command
program
  .command("start")
  .description("Sync folders, generate compose, and start containers")
  .option("--no-detach", "Run in foreground instead of detached mode")
  .option("--recreate", "Force recreate containers (use after rebuild)")
  .option("--openclaw-path <path>", "Path to openclaw repo (for building image)")
  .action(async (options) => {
    requireDocker();
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);

    if (!existsSync(paths.configFile)) {
      console.error(`Error: Config file not found: ${paths.configFile}`);
      console.error("Run 'npx polyclaw init' to create one.");
      process.exit(1);
    }

    const config = loadConfig(paths);
    await startCommand(config, paths, {
      detach: options.detach,
      recreate: options.recreate,
      openclawPath: options.openclawPath,
    });
  });

// restart command (alias for start --recreate)
program
  .command("restart")
  .description("Restart containers (alias for start --recreate)")
  .option("--no-detach", "Run in foreground instead of detached mode")
  .option("--openclaw-path <path>", "Path to openclaw repo (for building image)")
  .action(async (options) => {
    requireDocker();
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);

    if (!existsSync(paths.configFile)) {
      console.error(`Error: Config file not found: ${paths.configFile}`);
      console.error("Run 'npx polyclaw init' to create one.");
      process.exit(1);
    }

    const config = loadConfig(paths);
    await startCommand(config, paths, {
      detach: options.detach,
      recreate: true,
      openclawPath: options.openclawPath,
    });
  });

// stop command
program
  .command("stop")
  .description("Stop and remove containers")
  .action(() => {
    requireDocker();
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);
    stopCommand(paths);
  });

// logs command
program
  .command("logs [service]")
  .description("View container logs")
  .option("-f, --follow", "Follow log output")
  .option("-n, --tail <lines>", "Number of lines to show from the end")
  .action((service, options) => {
    requireDocker();
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);
    logsCommand(paths, {
      follow: options.follow,
      tail: options.tail,
      service,
    });
  });

// status command
program
  .command("status")
  .description("Show infrastructure status")
  .action(withConfig((config, paths) => {
    requireDocker();
    return statusCommand(config, paths);
  }));

// generate command
program
  .command("generate")
  .description("Regenerate docker-compose.yml from config")
  .action(withConfig(generateCommand));

// configure command
program
  .command("configure")
  .description("Apply configuration to running containers")
  .action(withConfig((config, paths) => {
    requireDocker();
    return configureCommand(config, paths);
  }));

// open command
program
  .command("open [instance]")
  .description("Open web UI in browser")
  .action((instance) => {
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);

    if (!existsSync(paths.configFile)) {
      console.error(`Error: Config file not found: ${paths.configFile}`);
      process.exit(1);
    }

    const config = loadConfig(paths);
    openCommand(config, paths, instance);
  });

// build command
program
  .command("build")
  .description("Build or rebuild the Docker image")
  .option("--openclaw-path <path>", "Path to openclaw repo")
  .action(async (options) => {
    requireDocker();
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);

    if (!existsSync(paths.configFile)) {
      console.error(`Error: Config file not found: ${paths.configFile}`);
      process.exit(1);
    }

    const config = loadConfig(paths);
    await buildCommand(config, paths, { openclawPath: options.openclawPath });
  });

// tail command (shortcut for logs -f --tail 100)
program
  .command("tail [instance]")
  .description("Follow logs from a container (shortcut for logs -f)")
  .option("-n, --lines <count>", "Number of lines to show", "100")
  .action((instance, options) => {
    requireDocker();
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);
    logsCommand(paths, {
      follow: true,
      tail: options.lines,
      service: instance,
    });
  });

// shell command
program
  .command("shell [instance]")
  .description("Open interactive shell in a container")
  .action((instance) => {
    requireDocker();
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);

    if (!existsSync(paths.configFile)) {
      console.error(`Error: Config file not found: ${paths.configFile}`);
      process.exit(1);
    }

    const config = loadConfig(paths);
    shellCommand(config, paths, instance);
  });

// pair command
program
  .command("pair [instance] [code]")
  .description("List or approve pairing codes")
  .option("--channel <channel>", "Channel to pair (telegram, whatsapp, etc.)", "telegram")
  .action((instance, code, options) => {
    requireDocker();
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);

    if (!existsSync(paths.configFile)) {
      console.error(`Error: Config file not found: ${paths.configFile}`);
      process.exit(1);
    }

    const config = loadConfig(paths);
    pairCommand(config, paths, { instance, code, channel: options.channel });
  });

program.parse();
