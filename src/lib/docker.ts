/**
 * Docker command execution wrappers
 */

import { execSync, spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import chalk from "chalk";
import type { ConfigPaths } from "./config.js";

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

const OPENCLAW_REPO = "https://github.com/openclaw/openclaw.git";
const POLYCLAW_HOME = join(homedir(), ".polyclaw");
const OPENCLAW_CLONE_PATH = join(POLYCLAW_HOME, "openclaw");

/**
 * Find or clone the openclaw repository
 */
export function findOpenclawRepo(customPath?: string): string {
  // 1. Check custom path if provided
  if (customPath) {
    const resolved = customPath.startsWith("/") ? customPath : join(process.cwd(), customPath);
    if (existsSync(join(resolved, "Dockerfile"))) {
      return resolved;
    }
    console.error(chalk.red(`Error: Dockerfile not found at ${resolved}`));
    process.exit(1);
  }

  // 2. Check ~/.polyclaw/openclaw
  if (existsSync(join(OPENCLAW_CLONE_PATH, "Dockerfile"))) {
    return OPENCLAW_CLONE_PATH;
  }

  // 3. Clone the repo to ~/.polyclaw/openclaw
  console.log(chalk.yellow(`  OpenClaw repo not found, cloning...`));
  console.log(chalk.dim(`  To: ${OPENCLAW_CLONE_PATH}`));

  // Ensure ~/.polyclaw exists
  if (!existsSync(POLYCLAW_HOME)) {
    mkdirSync(POLYCLAW_HOME, { recursive: true });
  }

  execSync(`git clone --depth 1 ${OPENCLAW_REPO} "${OPENCLAW_CLONE_PATH}"`, {
    stdio: "inherit",
    encoding: "utf-8",
  });

  return OPENCLAW_CLONE_PATH;
}

/**
 * Build the openclaw Docker image
 */
export function buildImage(imageName: string, openclawPath: string): void {
  console.log(chalk.green(`=== Building ${imageName} ===`));
  console.log(chalk.dim(`  From: ${openclawPath}`));

  execSync(`docker build -t ${imageName} .`, {
    cwd: openclawPath,
    stdio: "inherit",
    encoding: "utf-8",
  });

  console.log(chalk.green(`  Image ${imageName} built successfully`));
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

  writeFileSync(dockerfilePath, dockerfileContent);

  try {
    execSync(`docker build -f "${dockerfilePath}" -t polyclaw:base .`, {
      cwd: tmpdir(),
      stdio: "inherit",
      encoding: "utf-8",
    });
    console.log(chalk.green(`  Image polyclaw:base built successfully`));
  } finally {
    unlinkSync(dockerfilePath);
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
export function ensureBaseImages(openclawPath?: string): void {
  const repoPath = findOpenclawRepo(openclawPath);

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
export function ensureImage(
  imageName: string,
  options: { openclawPath?: string; baseDir?: string } = {}
): void {
  if (imageExists(imageName)) {
    return;
  }

  const { openclawPath, baseDir } = options;

  // Check if this is an extended image (has Dockerfile.extended)
  const hasExtended = baseDir && existsSync(join(baseDir, "Dockerfile.extended"));
  const isExtendedImage = imageName !== "openclaw:local" && imageName !== "polyclaw:base" && hasExtended;

  if (isExtendedImage) {
    // Ensure base images exist first
    ensureBaseImages(openclawPath);
    // Then build extended image
    console.log(chalk.yellow(`  Image ${imageName} not found, building...`));
    buildExtendedImage(imageName, baseDir!);
  } else if (imageName === "polyclaw:base") {
    ensureBaseImages(openclawPath);
  } else {
    const repoPath = findOpenclawRepo(openclawPath);
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
