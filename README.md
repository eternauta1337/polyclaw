# Polyclaw

Run multiple OpenClaw instances with Docker.

## Quick Start

```bash
# Initialize in your project directory
npx polyclaw init

# Edit .env with your API keys
# Edit polyclaw.json5 to configure instances

# Start containers (builds image if needed)
npx polyclaw start

# View status
npx polyclaw status

# View logs
npx polyclaw logs -f

# Stop containers
npx polyclaw stop
```

## What `start` Does

1. **Builds Docker image** if `openclaw:local` doesn't exist
2. **Copies runtime files** (`entrypoint.ts`) if missing
3. **Creates instance folders** with initial config
4. **Generates `docker-compose.yml`**
5. **Starts containers** in detached mode

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
  "project": "openclaw",

  "instances": {
    "main": {
      "port": 18789
    },
    "secondary": {
      "port": 18790
    }
  }
}
```

### Environment Variables

Create a `.env` file with:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
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

## Requirements

- Node.js >= 22
- Docker with Docker Compose

The OpenClaw Docker image is built automatically from the bundled `openclaw` dependency.

## License

MIT
