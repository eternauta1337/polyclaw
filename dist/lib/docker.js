/**
 * Docker command execution wrappers
 */
import { execSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
const __dirname = dirname(fileURLToPath(import.meta.url));
/**
 * Check if a Docker container is running
 */
export function isContainerRunning(containerName) {
    try {
        const result = execSync(`docker inspect -f '{{.State.Running}}' ${containerName} 2>/dev/null`, { encoding: "utf-8" });
        return result.trim() === "true";
    }
    catch {
        return false;
    }
}
/**
 * Read config from a running container
 */
export function readContainerConfig(containerName) {
    try {
        const result = execSync(`docker exec ${containerName} cat /home/node/.openclaw/openclaw.json 2>/dev/null`, { encoding: "utf-8" });
        return JSON.parse(result);
    }
    catch {
        return null;
    }
}
/**
 * Execute a command in a container
 */
export function execInContainer(containerName, command, options = {}) {
    const result = execSync(`docker exec ${containerName} ${command}`, {
        encoding: "utf-8",
        stdio: options.stdio || "pipe",
    });
    return result;
}
/**
 * Run docker compose command
 */
export function dockerCompose(args, paths, options = {}) {
    execSync(`docker compose ${args.join(" ")}`, {
        cwd: paths.baseDir,
        stdio: options.stdio || "inherit",
        encoding: "utf-8",
    });
}
/**
 * Run docker compose command with streaming output
 */
export function dockerComposeStream(args, paths) {
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
export function imageExists(imageName) {
    try {
        execSync(`docker image inspect ${imageName}`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        });
        return true;
    }
    catch {
        return false;
    }
}
const OPENCLAW_REPO = "https://github.com/openclaw/openclaw.git";
const POLYCLAW_HOME = join(homedir(), ".polyclaw");
const OPENCLAW_CLONE_PATH = join(POLYCLAW_HOME, "openclaw");
/**
 * Find or clone the openclaw repository
 */
export function findOpenclawRepo(customPath) {
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
export function buildImage(imageName, openclawPath) {
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
 * Ensure the Docker image exists, building it if necessary
 */
export function ensureImage(imageName, openclawPath) {
    if (imageExists(imageName)) {
        return;
    }
    console.log(chalk.yellow(`  Image ${imageName} not found, building...`));
    const repoPath = findOpenclawRepo(openclawPath);
    buildImage(imageName, repoPath);
}
/**
 * Get container status information
 */
export function getContainerStatus(project, instanceName) {
    const containerName = `${project}-${instanceName}`;
    try {
        const result = execSync(`docker inspect -f '{{.State.Status}}' ${containerName} 2>/dev/null`, { encoding: "utf-8" });
        const status = result.trim();
        return {
            running: status === "running",
            status,
        };
    }
    catch {
        return { running: false };
    }
}
//# sourceMappingURL=docker.js.map