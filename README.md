<p align="center">
  <img src="assets/header.jpg" alt="dev-terminal - Terminal automation for AI assistants" width="100%">
</p>

Terminal automation for AI assistants. Inspired by [dev-browser](https://github.com/sawyerhood/dev-browser).

**Key features:**

- **Persistent sessions** - Create once, interact across multiple scripts
- **Headed mode** - Browser UI to watch AI actions in real-time
- **Full PTY support** - Run interactive TUI apps (htop, vim, ncurses, etc.)
- **LLM-friendly snapshots** - Text, ANSI, or SVG output for AI analysis

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- [Node.js](https://nodejs.org) (v18 or later) with npm

## Installation

### Claude Code

```
/install parkerhancock/dev-terminal
```

Restart Claude Code after installation.

### Manual / Standalone

```bash
git clone https://github.com/parkerhancock/dev-terminal
cd dev-terminal && npm install
```

## Usage

Start the server:

```bash
# Headless
./server.sh

# With browser UI (watch terminals live)
./server.sh --headed
```

Then interact via HTTP API or TypeScript client:

```typescript
import { connect } from "./src/client.js";

const client = await connect();
const term = await client.terminal("my-app");

await term.writeLine("ls -la");
await term.waitForText("total");

const snap = await term.snapshot();
console.log(snap.text);

await term.key("ctrl+c");
client.disconnect();
```

By default, terminals use your system shell (`$SHELL`) as a login shell, so your aliases, PATH, and environment are available. Override with `command` and `args` options.

## Headed Mode

Start with `--headed` to open a browser UI showing all terminals in real-time:

```bash
./server.sh --headed
```

- **Live view** - Watch AI actions as they happen
- **Tabs or tiles** - Switch between terminals or view all at once
- **Bidirectional** - Type in browser to interact alongside AI
- **Auto-reconnect** - Reconnects if connection drops

## API

| Endpoint                               | Method    | Description            |
| -------------------------------------- | --------- | ---------------------- |
| `/terminals`                           | GET       | List all terminals     |
| `/terminals`                           | POST      | Create or get terminal |
| `/terminals/:name`                     | DELETE    | Close terminal         |
| `/terminals/:name/write`               | POST      | Write to terminal      |
| `/terminals/:name/snapshot`            | GET       | Get screen content     |
| `/terminals/:name/snapshot?format=svg` | GET       | Get screen as SVG      |
| `/terminals/:name/resize`              | POST      | Resize terminal        |
| `/ws`                                  | WebSocket | Real-time streaming    |

## Special Keys

```typescript
// Navigation
await term.key("up");
await term.key("down");
await term.key("enter");
await term.key("tab");

// Control
await term.key("ctrl+c");
await term.key("ctrl+d");
await term.key("escape");

// Function keys
await term.key("f1");
await term.key("f12");
```

Full list: `up`, `down`, `left`, `right`, `enter`, `tab`, `escape`, `backspace`, `delete`, `home`, `end`, `pageup`, `pagedown`, `insert`, `f1`-`f12`, `ctrl+c`, `ctrl+d`, `ctrl+z`, `ctrl+l`, `ctrl+a`, `ctrl+e`, `ctrl+k`, `ctrl+u`, `ctrl+w`, `ctrl+r`

## How It Works

```
┌─────────────────────────────────────────┐
│           dev-terminal server           │
├─────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ PTY "a" │ │ PTY "b" │ │ PTY "n" │   │
│  └────┬────┘ └────┬────┘ └────┬────┘   │
│       └───────────┼───────────┘         │
│             ┌─────┴─────┐               │
│             │ Registry  │               │
│             └─────┬─────┘               │
│       ┌───────────┼───────────┐         │
│  ┌────┴────┐ ┌────┴────┐ ┌────┴────┐   │
│  │  HTTP   │ │   WS    │ │ Static  │   │
│  └────┬────┘ └────┬────┘ └────┬────┘   │
└───────┼───────────┼───────────┼─────────┘
        │           │           │
   ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
   │   AI    │ │ Browser │ │ Browser │
   │ Client  │ │  (WS)   │ │  (WS)   │
   └─────────┘ └─────────┘ └─────────┘
```

Like dev-browser maintains persistent browser pages, dev-terminal maintains persistent PTY sessions. AI scripts can reconnect to existing terminals without losing state.

## Documentation

- [SKILL.md](./SKILL.md) - Usage guide for AI assistants
- [CLAUDE.md](./CLAUDE.md) - Development context

## License

MIT

## Acknowledgments

Inspired by [dev-browser](https://github.com/sawyerhood/dev-browser) by [Sawyer Hood](https://github.com/sawyerhood).
