#!/usr/bin/env node

/**
 * Polyclaw CLI - Run multiple OpenClaw instances with Docker
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, resolveConfigPaths } from "./lib/config.js";
import { dockerCompose, requireDocker, setOpenclawPath } from "./lib/docker.js";
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

// set-path command - doesn't need config
program
  .command("set-path <path>")
  .description("Set the global openclaw repo path (persisted to ~/.polyclaw/config.json)")
  .action((path: string) => {
    setOpenclawPath(path);
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
  .command("start [instance]")
  .description("Sync config + start containers. Use after: polyclaw.json5 changes, polyclaw build, or first run.")
  .option("--no-detach", "Run in foreground instead of detached mode")
  .option("--recreate", "Force recreate all containers (use after env changes that require restart)")
  .option("--openclaw-path <path>", "Path to openclaw repo (for building image)")
  .action(async (instance, options) => {
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
      instance,
    });
  });

// restart command
// With [instance]: simple docker restart (fast, no recreate). Use after: config file edits on bind-mount.
// Without [instance]: full recreate of all containers (= start --recreate). Use after: env changes.
program
  .command("restart [instance]")
  .description("Restart one instance (e.g. 'ale') or all containers. Use after config edits or env changes.")
  .option("--no-detach", "Run in foreground instead of detached mode (only applies when restarting all)")
  .option("--openclaw-path <path>", "Path to openclaw repo (only applies when restarting all)")
  .action(async (instance, options) => {
    requireDocker();
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);

    if (!existsSync(paths.configFile)) {
      console.error(`Error: Config file not found: ${paths.configFile}`);
      console.error("Run 'npx polyclaw init' to create one.");
      process.exit(1);
    }

    if (instance) {
      // Simple restart of a single container via docker compose
      dockerCompose(["restart", instance], paths);
    } else {
      // Full recreate of all containers
      const config = loadConfig(paths);
      await startCommand(config, paths, {
        detach: options.detach,
        recreate: true,
        openclawPath: options.openclawPath,
      });
    }
  });

// stop command
program
  .command("stop [instance]")
  .description("Stop one instance (e.g. 'ale') or all containers")
  .option("--keep-images", "Keep local images after stopping (default: remove them)")
  .action((instance, options) => {
    requireDocker();
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);
    stopCommand(paths, instance, { keepImages: options.keepImages });
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
  .description("Apply polyclaw.json5 config changes to running containers (no restart needed for most changes).")
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
  .description("Build/rebuild the Docker image. Run 'start' after to apply to containers.")
  .option("--openclaw-path <path>", "Path to openclaw repo")
  .option("--no-cache", "Disable Docker layer cache (force full rebuild)")
  .action(async (options) => {
    requireDocker();
    const opts = program.opts();
    const paths = resolveConfigPaths(opts.config);

    if (!existsSync(paths.configFile)) {
      console.error(`Error: Config file not found: ${paths.configFile}`);
      process.exit(1);
    }

    const config = loadConfig(paths);
    await buildCommand(config, paths, { openclawPath: options.openclawPath, noCache: !options.cache });
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
