/**
 * Docker command execution wrappers
 */

import { execSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import chalk from "chalk";
import type { ConfigPaths, InfraConfig } from "./config.js";

export interface DockerStatus {
  installed: boolean;
  running: boolean;
  error?: string;
}

/**
 * Check if Docker is installed on the system
 */
export function isDockerInstalled(): boolean {
  try {
    execSync("docker --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker daemon is running
 */
export function isDockerDaemonRunning(): boolean {
  try {
    execSync("docker info", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check Docker availability and return status
 */
export function checkDocker(): DockerStatus {
  if (!isDockerInstalled()) {
    return {
      installed: false,
      running: false,
      error: "Docker is not installed. Please install Docker Desktop from https://docker.com/products/docker-desktop",
    };
  }

  if (!isDockerDaemonRunning()) {
    return {
      installed: true,
      running: false,
      error: "Docker daemon is not running. Please start Docker Desktop or run 'sudo systemctl start docker'",
    };
  }

  return { installed: true, running: true };
}

/**
 * Require Docker to be available, exit with error if not
 */
export function requireDocker(): void {
  const status = checkDocker();
  if (!status.running) {
    console.error(chalk.red(`Error: ${status.error}`));
    process.exit(1);
  }
}

export interface DockerExecOptions {
  cwd?: string;
  stdio?: "inherit" | "pipe";
}

/**
 * Check if a Docker container is running
 */
export function isContainerRunning(containerName: string): boolean {
  try {
    const result = execSync(
      `docker inspect -f '{{.State.Running}}' ${containerName} 2>/dev/null`,
      { encoding: "utf-8" }
    );
    return result.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Read config from a running container
 */
export function readContainerConfig(
  containerName: string
): Record<string, unknown> | null {
  try {
    const result = execSync(
      `docker exec ${containerName} cat /home/node/.openclaw/openclaw.json 2>/dev/null`,
      { encoding: "utf-8" }
    );
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * Execute a command in a container
 */
export function execInContainer(
  containerName: string,
  command: string,
  options: DockerExecOptions = {}
): string {
  const result = execSync(`docker exec ${containerName} ${command}`, {
    encoding: "utf-8",
    stdio: options.stdio || "pipe",
  });
  return result;
}

/**
 * Run docker compose command
 */
export function dockerCompose(
  args: string[],
  paths: ConfigPaths,
  options: DockerExecOptions = {}
): void {
  execSync(`docker compose ${args.join(" ")}`, {
    cwd: paths.baseDir,
    stdio: options.stdio || "inherit",
    encoding: "utf-8",
  });
}

/**
 * Run docker compose command with streaming output
 */
export function dockerComposeStream(
  args: string[],
  paths: ConfigPaths
): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", ["compose", ...args], {
      cwd: paths.baseDir,
      stdio: "inherit",
    });

    proc.on("error", reject);
    proc.on("exit", (code) => resolve(code ?? 0));
  });
}

/**
 * Check if a Docker image exists locally
 */
export function imageExists(imageName: string): boolean {
  try {
    execSync(`docker image inspect ${imageName}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_OPENCLAW_REPO = "git@github.com:eternauta1337/openclaw.git";
const POLYCLAW_HOME = join(homedir(), ".polyclaw");
const OPENCLAW_CLONE_PATH = join(POLYCLAW_HOME, "openclaw");
const GLOBAL_CONFIG_PATH = join(POLYCLAW_HOME, "config.json");

interface PolyclawGlobalConfig {
  openclawPath?: string;
}

function readGlobalConfig(): PolyclawGlobalConfig {
  if (!existsSync(GLOBAL_CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeGlobalConfig(config: PolyclawGlobalConfig): void {
  if (!existsSync(POLYCLAW_HOME)) mkdirSync(POLYCLAW_HOME, { recursive: true });
  writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Extract compiled dist/config/ from a Docker image to OPENCLAW_CLONE_PATH/dist/config/
 * so the host has the Zod schema for config validation.
 * Non-fatal: failure just means schema won't be available until next build.
 */
function extractSchemaFromImage(imageName: string): void {
  // destDir = ~/.polyclaw/openclaw/dist/config (via symlink if set)
  const distDir = join(OPENCLAW_CLONE_PATH, "dist");
  const destDir = join(distDir, "config");
  const containerName = `polyclaw-schema-extract-${Date.now()}`;
  try {
    // Ensure parent dist/ exists; remove stale config/ dir if present
    mkdirSync(distDir, { recursive: true });
    if (existsSync(destDir)) {
      rmSync(destDir, { recursive: true, force: true });
    }
    execSync(`docker create --name "${containerName}" "${imageName}"`, {
      stdio: "pipe",
      encoding: "utf-8",
    });
    // Copy the config/ directory itself into dist/ → results in dist/config/
    // Avoid trailing /. which is not supported by the legacy Docker builder
    execSync(`docker cp "${containerName}:/app/dist/config" "${distDir}/"`, {
      stdio: "pipe",
      encoding: "utf-8",
    });
    console.log(chalk.dim(`  Schema extracted to ${destDir}`));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(chalk.yellow(`  Warning: failed to extract schema from image — ${msg}`));
    console.warn(chalk.dim(`  Run 'polyclaw build' again to retry`));
  } finally {
    try {
      execSync(`docker rm "${containerName}"`, { stdio: "pipe", encoding: "utf-8" });
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Set the global openclaw path, persisted to ~/.polyclaw/config.json.
 * Also creates the symlink ~/.polyclaw/openclaw → <path>.
 */
export function setOpenclawPath(inputPath: string): void {
  const resolved = resolve(inputPath);
  if (!existsSync(join(resolved, "Dockerfile"))) {
    console.error(chalk.red(`Error: Not an openclaw repo (Dockerfile not found at ${resolved})`));
    process.exit(1);
  }
  const current = readGlobalConfig();
  writeGlobalConfig({ ...current, openclawPath: resolved });
  ensureSymlink(resolved);
  console.log(chalk.green(`OpenClaw path set: ${resolved}`));
  console.log(chalk.dim(`Run 'polyclaw build' to rebuild the image and make schema available`));
}

function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question(question, (answer) => {
      rl.close();
      res(answer.trim().toLowerCase() !== "n");
    });
  });
}

/**
 * Ensure a symlink at ~/.polyclaw/openclaw points to the given target path.
 * Creates or updates the symlink as needed.
 */
function ensureSymlink(targetPath: string): void {
  const resolvedTarget = resolve(targetPath);

  if (!existsSync(POLYCLAW_HOME)) {
    mkdirSync(POLYCLAW_HOME, { recursive: true });
  }

  // Check if symlink already points to the right place
  if (existsSync(OPENCLAW_CLONE_PATH)) {
    try {
      const stat = lstatSync(OPENCLAW_CLONE_PATH);
      if (stat.isSymbolicLink()) {
        const current = readlinkSync(OPENCLAW_CLONE_PATH);
        if (resolve(current) === resolvedTarget) {
          return; // Already correct
        }
        // Wrong target, remove and recreate
        unlinkSync(OPENCLAW_CLONE_PATH);
      } else {
        // It's a real directory (e.g. a previous clone), skip
        console.log(chalk.yellow(`  Warning: ${OPENCLAW_CLONE_PATH} exists and is not a symlink.`));
        console.log(chalk.yellow(`  Remove it manually to use openclaw_path from config.`));
        return;
      }
    } catch {
      // Can't read, try to proceed
    }
  }

  symlinkSync(resolvedTarget, OPENCLAW_CLONE_PATH);
  console.log(chalk.dim(`  Symlinked ${OPENCLAW_CLONE_PATH} → ${resolvedTarget}`));
}

/**
 * Find the openclaw repository.
 *
 * Resolution order:
 * 1. --openclaw-path CLI flag (direct use, no symlink)
 * 2. docker.openclaw_path from config (creates symlink to ~/.polyclaw/openclaw)
 * 3. ~/.polyclaw/openclaw (existing clone or symlink)
 * 4. Prompt to clone from docker.openclaw_repo or default GitHub URL
 */
export async function findOpenclawRepo(
  customPath?: string,
  dockerConfig?: InfraConfig["docker"],
): Promise<string> {
  // 1. CLI flag override (direct use, no symlink)
  if (customPath) {
    const resolved = customPath.startsWith("/") ? customPath : join(process.cwd(), customPath);
    if (existsSync(join(resolved, "Dockerfile"))) {
      return resolved;
    }
    console.error(chalk.red(`Error: Dockerfile not found at ${resolved}`));
    process.exit(1);
  }

  // 2. Config-based path → create/update symlink
  if (dockerConfig?.openclaw_path) {
    const configPath = resolve(dockerConfig.openclaw_path);
    if (!existsSync(join(configPath, "Dockerfile"))) {
      console.error(chalk.red(`Error: Dockerfile not found at ${configPath} (from docker.openclaw_path)`));
      process.exit(1);
    }
    ensureSymlink(configPath);
    return OPENCLAW_CLONE_PATH;
  }

  // 3. Global config (~/.polyclaw/config.json openclawPath)
  const globalConfig = readGlobalConfig();
  if (globalConfig.openclawPath) {
    const globalPath = resolve(globalConfig.openclawPath);
    if (existsSync(join(globalPath, "Dockerfile"))) {
      ensureSymlink(globalPath);
      return OPENCLAW_CLONE_PATH;
    }
    console.log(chalk.yellow(`  Warning: Configured openclaw path not found: ${globalPath}`));
    console.log(chalk.yellow(`  Run 'polyclaw set-path <path>' to update it`));
  }

  // 4. Check ~/.polyclaw/openclaw (real dir or existing symlink)
  if (existsSync(join(OPENCLAW_CLONE_PATH, "Dockerfile"))) {
    return OPENCLAW_CLONE_PATH;
  }

  // 5. Ask whether to clone
  const repoUrl = dockerConfig?.openclaw_repo || DEFAULT_OPENCLAW_REPO;
  console.log(chalk.yellow(`  OpenClaw repo not found.`));
  const yes = await promptYesNo(
    `  Clone from ${repoUrl} to ${OPENCLAW_CLONE_PATH}? [Y/n] `,
  );
  if (!yes) {
    console.error(chalk.dim(`  Provide the path with: --openclaw-path <path>`));
    console.error(chalk.dim(`  Or set docker.openclaw_path in polyclaw.json5`));
    process.exit(1);
  }

  if (!existsSync(POLYCLAW_HOME)) {
    mkdirSync(POLYCLAW_HOME, { recursive: true });
  }

  execSync(`git clone --depth 1 ${repoUrl} "${OPENCLAW_CLONE_PATH}"`, {
    stdio: "inherit",
    encoding: "utf-8",
  });

  return OPENCLAW_CLONE_PATH;
}

/**
 * Build the openclaw Docker image
 */
export function buildImage(imageName: string, openclawPath: string, opts: { noCache?: boolean } = {}): void {
  console.log(chalk.green(`=== Building ${imageName} ===`));
  console.log(chalk.dim(`  From: ${openclawPath}`));

  const noCacheFlag = opts.noCache ? " --no-cache" : "";
  execSync(`docker build${noCacheFlag} -t ${imageName} .`, {
    cwd: openclawPath,
    stdio: "inherit",
    encoding: "utf-8",
  });

  console.log(chalk.green(`  Image ${imageName} built successfully`));

  // Extract compiled schema to host for config validation
  extractSchemaFromImage(imageName);
}

/**
 * Build polyclaw:base image from openclaw:local
 * Adds common utilities like the openclaw CLI wrapper
 */
export function buildPolyclawBase(): void {
  console.log(chalk.green(`=== Building polyclaw:base ===`));
  console.log(chalk.dim(`  Adding openclaw CLI wrapper`));

  // Create temp Dockerfile
  const dockerfilePath = join(tmpdir(), "Dockerfile.polyclaw-base");
  const dockerfileContent = `FROM openclaw:local
USER root
RUN echo '#!/bin/sh' > /usr/local/bin/openclaw && \\
    echo 'exec node /app/openclaw.mjs "$@"' >> /usr/local/bin/openclaw && \\
    chmod +x /usr/local/bin/openclaw
USER node
`;

  // Use a dedicated empty build context dir to avoid tmpdir files that Docker can't read
  const buildCtxDir = join(tmpdir(), "polyclaw-base-ctx");
  mkdirSync(buildCtxDir, { recursive: true });
  writeFileSync(dockerfilePath, dockerfileContent);

  try {
    execSync(`docker build -f "${dockerfilePath}" -t polyclaw:base .`, {
      cwd: buildCtxDir,
      stdio: "inherit",
      encoding: "utf-8",
    });
    console.log(chalk.green(`  Image polyclaw:base built successfully`));
  } finally {
    unlinkSync(dockerfilePath);
    rmSync(buildCtxDir, { recursive: true, force: true });
  }
}

/**
 * Build an extended Docker image from a Dockerfile.extended
 */
export function buildExtendedImage(imageName: string, baseDir: string): void {
  const dockerfilePath = join(baseDir, "Dockerfile.extended");

  if (!existsSync(dockerfilePath)) {
    return;
  }

  console.log(chalk.green(`=== Building extended image ${imageName} ===`));
  console.log(chalk.dim(`  From: ${dockerfilePath}`));

  execSync(`docker build -f Dockerfile.extended -t ${imageName} .`, {
    cwd: baseDir,
    stdio: "inherit",
    encoding: "utf-8",
  });

  console.log(chalk.green(`  Image ${imageName} built successfully`));
}

/**
 * Ensure the base images exist (openclaw:local -> polyclaw:base)
 */
export async function ensureBaseImages(
  openclawPath?: string,
  dockerConfig?: InfraConfig["docker"],
): Promise<void> {
  const repoPath = await findOpenclawRepo(openclawPath, dockerConfig);

  // Build openclaw:local if needed
  if (!imageExists("openclaw:local")) {
    console.log(chalk.yellow(`Building base image openclaw:local...`));
    buildImage("openclaw:local", repoPath);
    console.log();
  }

  // Build polyclaw:base if needed (adds openclaw CLI wrapper)
  if (!imageExists("polyclaw:base")) {
    buildPolyclawBase();
    console.log();
  }
}

/**
 * Ensure the Docker image exists, building it if necessary
 */
export async function ensureImage(
  imageName: string,
  options: { openclawPath?: string; baseDir?: string; dockerConfig?: InfraConfig["docker"] } = {}
): Promise<void> {
  if (imageExists(imageName)) {
    return;
  }

  const { openclawPath, baseDir, dockerConfig } = options;

  // Check if this is an extended image (has Dockerfile.extended)
  const hasExtended = baseDir && existsSync(join(baseDir, "Dockerfile.extended"));
  const isExtendedImage = imageName !== "openclaw:local" && imageName !== "polyclaw:base" && hasExtended;

  if (isExtendedImage) {
    // Ensure base images exist first
    await ensureBaseImages(openclawPath, dockerConfig);
    // Then build extended image
    console.log(chalk.yellow(`  Image ${imageName} not found, building...`));
    buildExtendedImage(imageName, baseDir!);
  } else if (imageName === "polyclaw:base") {
    await ensureBaseImages(openclawPath, dockerConfig);
  } else {
    const repoPath = await findOpenclawRepo(openclawPath, dockerConfig);
    console.log(chalk.yellow(`  Image ${imageName} not found, building...`));
    buildImage(imageName, repoPath);
  }
}

/**
 * Get container status information
 */
export function getContainerStatus(
  project: string,
  instanceName: string
): {
  running: boolean;
  status?: string;
} {
  const containerName = `${project}-${instanceName}`;
  try {
    const result = execSync(
      `docker inspect -f '{{.State.Status}}' ${containerName} 2>/dev/null`,
      { encoding: "utf-8" }
    );
    const status = result.trim();
    return {
      running: status === "running",
      status,
    };
  } catch {
    return { running: false };
  }
}
