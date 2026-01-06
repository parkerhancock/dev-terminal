# dev-terminal

Persistent terminal (PTY) session management via HTTP API. Designed for AI assistants to run and interact with TUI applications.

## Features

- **Persistent sessions**: Terminal sessions survive across multiple API calls
- **Named terminals**: Create and manage multiple named terminal instances
- **Full PTY support**: Run interactive TUI apps (htop, vim, etc.)
- **Keyboard control**: Send special keys, ctrl combinations, function keys
- **Screen capture**: Get terminal snapshots with or without ANSI codes

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm run start-server

# Or use the shell wrapper
./server.sh
```

The server runs on port 9333 by default.

## API Overview

### Endpoints

| Endpoint                    | Method | Description               |
| --------------------------- | ------ | ------------------------- |
| `/terminals`                | GET    | List all active terminals |
| `/terminals/:name`          | GET    | Get terminal info         |
| `/terminals/:name`          | POST   | Create terminal           |
| `/terminals/:name`          | DELETE | Close terminal            |
| `/terminals/:name/write`    | POST   | Write to terminal         |
| `/terminals/:name/key`      | POST   | Send special key          |
| `/terminals/:name/snapshot` | GET    | Get screen content        |
| `/terminals/:name/resize`   | POST   | Resize terminal           |

### Example Usage

```typescript
import { DevTerminalClient } from "./src/client.js";

const client = new DevTerminalClient();

// Create a terminal
await client.createTerminal("my-term", { shell: "bash" });

// Run a command
await client.write("my-term", "ls -la\n");

// Wait for output
await client.waitForText("my-term", "total");

// Get screen snapshot
const snapshot = await client.snapshot("my-term");
console.log(snapshot.text);

// Send special keys
await client.key("my-term", "ctrl+c");
```

## Documentation

- [SKILL.md](./SKILL.md) - Detailed usage guide for AI assistants
- [CLAUDE.md](./CLAUDE.md) - Development context for Claude Code

## Development

```bash
# Watch mode
npm run dev

# Type check
npm run typecheck

# Format code
npm run format
```

## License

MIT
