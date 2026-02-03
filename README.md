# Polyclaw

Run multiple OpenClaw instances with Docker.

## Installation

```bash
# Global installation
npm install -g polyclaw

# Or as a dev dependency in your project
npm install -D polyclaw
```

## Quick Start

Assuming global installation:

```bash
# Initialize in your project directory
polyclaw init

# Edit .env with your API keys
# Edit polyclaw.json5 to configure instances

# Start containers (builds image if needed)
polyclaw start

# View status
polyclaw status

# View logs
polyclaw logs -f

# Stop containers
polyclaw stop
```

## What `start` Does

1. **Builds Docker image** if `openclaw:local` doesn't exist
2. **Copies runtime files** (`entrypoint.ts`) if missing
3. **Creates instance folders** with initial config
4. **Generates `docker-compose.yml`**
5. **Starts containers** in detached mode

## Directory Structure

After running `polyclaw start`, your project will look like:

```
myproject/
├── polyclaw.json5      # Your configuration
├── .env                # API keys and secrets
├── docker-compose.yml  # Generated (don't edit)
└── instances/          # Persistent data per instance
    ├── dev/
    │   ├── config/     # OpenClaw config (bound to container)
    │   └── workspace/  # User files and data
    └── prod/
        ├── config/
        └── workspace/
```

The `instances/` folder is bound to each container. Data persists across restarts.

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize polyclaw in current directory |
| `start` | Build image + sync + generate + start containers |
| `stop` | Stop and remove containers |
| `status` | Show infrastructure status |
| `logs [instance]` | View container logs |
| `tail [instance]` | Follow logs (shortcut for `logs -f`) |
| `open [instance]` | Open web UI in browser |
| `shell [instance]` | Open interactive shell in a container |
| `generate` | Regenerate docker-compose.yml |
| `configure` | Apply config to running containers |
| `build` | Build or rebuild the Docker image |

### Options

**Global:**
- `-c, --config <path>` - Path to polyclaw.json5 config file

**start:**
- `--no-detach` - Run in foreground
- `--recreate` - Force recreate containers
- `--openclaw-path <path>` - Path to openclaw repo

**logs:**
- `-f, --follow` - Follow log output
- `-n, --tail <lines>` - Number of lines to show

**tail:**
- `-n, --lines <count>` - Number of lines (default: 100)

**build:**
- `--openclaw-path <path>` - Path to openclaw repo

## Configuration

### polyclaw.json5

```json5
{
  "project": "myproject",

  // Base config: applies to ALL instances
  "config": {
    "tools": {
      "profile": "coding",
      "exec": {
        "security": "allowlist",
        "safeBins": ["ls", "cat", "git", "npm"]
      }
    }
  },

  // Each instance gets its own container and port
  // Can override base config as needed
  "instances": {
    "dev": {
      "port": 18789,
      "config": {
        "apiKey": "${ANTHROPIC_API_KEY_DEV}",  // Different API key
        "tools": {
          "exec": { "security": "full" }  // Override: allow all commands
        }
      }
    },
    "prod": {
      "port": 18790,
      "config": {
        "apiKey": "${ANTHROPIC_API_KEY_PROD}",
        "model": "claude-sonnet-4-20250514"  // Better model for prod
      }
      // Inherits base tools config (restricted exec)
    }
  }
}
```

### Environment Variables

Create a `.env` file with:

```bash
ANTHROPIC_API_KEY_DEV=sk-ant-...
ANTHROPIC_API_KEY_PROD=sk-ant-...
BRAVE_API_KEY=...  # Optional: for web search
```

Use `${VAR}` in your config to reference environment variables:

```json5
{
  "instances": {
    "main": {
      "channels": {
        "telegram": {
          "botToken": "${TELEGRAM_BOT_TOKEN}"
        }
      }
    }
  }
}
```

### Background Services

Run additional processes alongside the gateway using pm2. Services are defined globally and run in all instances.

```json5
{
  "services": [
    {
      "name": "wacli-sync",
      "command": "wacli sync --follow",
      "condition": "file:/home/node/.wacli/store.db"  // Only run if file exists
    },
    {
      "name": "my-daemon",
      "command": "/usr/local/bin/mydaemon --config /app/config.json"
    }
  ]
}
```

**Fields:**
- `name` - Process name (shown in pm2 list)
- `command` - Command to run
- `condition` - Optional. Currently supports `file:<path>` to only start when file exists

**How it works:**
- pm2-runtime runs as PID 1, managing both the gateway and services
- Services with conditions are checked every 60 seconds until the condition is met
- All processes auto-restart on failure
- View status: `docker exec <container> pm2 list`
- View logs: `docker exec <container> pm2 logs <service-name>`

**Note:** The Docker image must include pm2. The default `Dockerfile.extended` template includes it.

## Requirements

- Node.js >= 22
- Docker with Docker Compose

The OpenClaw Docker image is built automatically from the bundled `openclaw` dependency.

## License

MIT
