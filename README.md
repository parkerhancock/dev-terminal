# dev-terminal

Persistent terminal (PTY) session management via HTTP API. Designed for AI assistants to run and interact with TUI applications.

## Why dev-terminal?

When AI assistants interact with terminal applications, they typically lose context between commands. dev-terminal solves this by:

- **Maintaining persistent PTY sessions** that survive across API calls
- **Providing visual feedback** via a browser UI so humans can watch AI actions
- **Capturing screen state** as text, ANSI, or SVG for AI analysis
- **Supporting full interactivity** including special keys, TUI navigation, and bidirectional input

## Features

- **Persistent sessions** - Terminal sessions survive across multiple API calls
- **Named terminals** - Create and manage multiple named terminal instances
- **Full PTY support** - Run interactive TUI apps (htop, vim, ncurses, etc.)
- **Headed mode** - Browser UI to watch terminals in real-time
- **SVG snapshots** - Render terminal state as SVG for visual analysis
- **Keyboard control** - Send special keys, ctrl combinations, function keys
- **WebSocket streaming** - Real-time bidirectional communication

## Quick Start

```bash
# Install dependencies
npm install

# Start the server (headless)
./server.sh

# Or start with browser UI
./server.sh --headed
```

The server runs on `http://localhost:9333` by default.

## Headed Mode

Start with `--headed` to open a browser UI that shows all terminal sessions in real-time:

```bash
./server.sh --headed
```

The browser UI provides:

- **Live terminal view** - Watch AI actions as they happen
- **Multiple tabs** - Switch between different terminal sessions
- **Bidirectional input** - Type in the browser to interact alongside AI
- **Auto-reconnect** - Automatically reconnects if connection drops

This is useful for:

- Debugging AI terminal interactions
- Demonstrating AI capabilities to others
- Manual intervention when AI gets stuck
- Learning how AI navigates TUI applications

## API Reference

### Endpoints

| Endpoint                               | Method    | Description                  |
| -------------------------------------- | --------- | ---------------------------- |
| `/terminals`                           | GET       | List all active terminals    |
| `/terminals`                           | POST      | Create or get terminal       |
| `/terminals/:name`                     | DELETE    | Close terminal               |
| `/terminals/:name/write`               | POST      | Write data to terminal       |
| `/terminals/:name/snapshot`            | GET       | Get screen content           |
| `/terminals/:name/snapshot?format=svg` | GET       | Get screen as SVG            |
| `/terminals/:name/resize`              | POST      | Resize terminal              |
| `/terminals/:name/clear`               | POST      | Clear output buffer          |
| `/ws`                                  | WebSocket | Real-time terminal streaming |

### Create Terminal

```bash
curl -X POST http://localhost:9333/terminals \
  -H "Content-Type: application/json" \
  -d '{"name": "my-term", "cols": 120, "rows": 40}'
```

Options:

- `name` (required) - Unique terminal identifier
- `command` - Shell to run (default: bash)
- `args` - Arguments to pass to shell
- `cols` - Terminal width (default: 120)
- `rows` - Terminal height (default: 40)
- `cwd` - Working directory
- `env` - Additional environment variables

### Write to Terminal

```bash
curl -X POST http://localhost:9333/terminals/my-term/write \
  -H "Content-Type: application/json" \
  -d '{"data": "ls -la\n"}'
```

### Get Snapshot

```bash
# Text snapshot
curl http://localhost:9333/terminals/my-term/snapshot

# SVG snapshot (for visual rendering)
curl http://localhost:9333/terminals/my-term/snapshot?format=svg
```

Response includes:

- `text` - Plain text (ANSI stripped)
- `raw` - Raw output with ANSI codes
- `lines` - Array of recent lines
- `size` - Terminal dimensions
- `alive` - Whether process is running
- `exitCode` - Exit code if terminated
- `svg` - SVG rendering (if format=svg)

## TypeScript Client

```typescript
import { connect } from "dev-terminal/client";

const client = await connect("http://localhost:9333");

// Create or get a terminal
const term = await client.terminal("my-term", {
  cols: 120,
  rows: 40,
});

// Run a command
await term.writeLine("ls -la");

// Wait for specific output
await term.waitForText("total");

// Get screen snapshot
const snap = await term.snapshot();
console.log(snap.text);

// Get SVG rendering
const svgSnap = await term.snapshot({ format: "svg" });
console.log(svgSnap.svg);

// Send special keys
await term.key("ctrl+c");
await term.key("up");
await term.key("enter");

// Resize terminal
await term.resize(80, 24);

// Wait for process to exit
const exitCode = await term.waitForExit();
```

### Special Keys

```typescript
// Arrow keys
await term.key("up");
await term.key("down");
await term.key("left");
await term.key("right");

// Control keys
await term.key("enter");
await term.key("tab");
await term.key("escape");
await term.key("backspace");

// Ctrl combinations
await term.key("ctrl+c"); // Interrupt
await term.key("ctrl+d"); // EOF
await term.key("ctrl+z"); // Suspend
await term.key("ctrl+l"); // Clear screen
await term.key("ctrl+r"); // Reverse search

// Function keys
await term.key("f1");
await term.key("f12");

// Navigation
await term.key("home");
await term.key("end");
await term.key("pageup");
await term.key("pagedown");
```

## Use Cases

### AI-Driven TUI Automation

```typescript
// Navigate a menu-based application
await term.writeLine("./my-tui-app");
await term.waitForText("Main Menu");
await term.key("down");
await term.key("down");
await term.key("enter");
```

### Interactive Debugging

```typescript
// Start a debugger session
await term.writeLine("python -m pdb script.py");
await term.waitForText("(Pdb)");
await term.writeLine("break main");
await term.writeLine("continue");
```

### Long-Running Processes

```typescript
// Monitor a build process
await term.writeLine("npm run build");
const success = await term.waitForText("Build complete", { timeout: 60000 });
if (!success) {
  const snap = await term.snapshot();
  console.log("Build output:", snap.text);
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    dev-terminal server                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Terminal 1 │  │  Terminal 2 │  │  Terminal N │     │
│  │    (PTY)    │  │    (PTY)    │  │    (PTY)    │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│         └────────────────┼────────────────┘             │
│                          │                              │
│                    ┌─────┴─────┐                        │
│                    │  Registry │                        │
│                    └─────┬─────┘                        │
│                          │                              │
│         ┌────────────────┼────────────────┐             │
│         │                │                │             │
│    ┌────┴────┐    ┌─────┴─────┐    ┌─────┴─────┐       │
│    │  HTTP   │    │ WebSocket │    │  Static   │       │
│    │   API   │    │  Server   │    │  Files    │       │
│    └────┬────┘    └─────┬─────┘    └─────┬─────┘       │
│         │               │                │              │
└─────────┼───────────────┼────────────────┼──────────────┘
          │               │                │
    ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
    │ AI Client │   │  Browser  │   │  Browser  │
    │  (HTTP)   │   │   (WS)    │   │   (WS)    │
    └───────────┘   └───────────┘   └───────────┘
```

## Configuration

### Environment Variables

- `PORT` - Server port (default: 9333)

### Command Line Options

- `--headed` - Open browser UI on startup

## Development

```bash
# Watch mode
npm run dev

# Type check
npm run typecheck

# Format code
npm run format

# Format check (CI)
npm run format:check
```

## Documentation

- [SKILL.md](./SKILL.md) - Detailed usage guide for AI assistants
- [CLAUDE.md](./CLAUDE.md) - Development context for Claude Code
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines

## License

MIT
