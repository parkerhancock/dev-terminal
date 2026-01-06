# CLAUDE.md

Development context for Claude Code.

## Commands

```bash
# Start server (headless)
./server.sh

# Start server with browser UI
./server.sh --headed

# Development with watch
npm run dev

# Type checking
npm run typecheck

# Format code
npm run format
```

## Architecture

**Server** (`src/index.ts`):

- Express HTTP server managing PTY sessions
- WebSocket server for real-time streaming (headed mode)
- Registry of named terminals (Map<string, TerminalEntry>)
- Handles create/write/key/snapshot/resize operations
- SVG rendering via ansi-to-svg

**Client** (`src/client.ts`):

- TypeScript client for the HTTP API
- Methods: terminal, write, key, snapshot, resize, waitForText, waitForExit

**Types** (`src/types.ts`):

- Shared request/response interfaces
- SpecialKeys mapping (arrows, ctrl combos, function keys)

**Browser UI** (`public/index.html`):

- xterm.js-based terminal viewer
- WebSocket client for real-time updates
- Tabbed interface for multiple terminals

## Key Patterns

- **Path aliases**: `@/` maps to `./src/` (configured in package.json and tsconfig.json)
- **ES modules**: Project uses `"type": "module"`
- **node-pty**: Core dependency for PTY spawning

## TypeScript Notes

- Use `import type` for type-only imports
- Strict mode enabled
- Target: ES2022, Module: NodeNext
