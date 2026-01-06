# CLAUDE.md

Development context for Claude Code.

## Commands

```bash
# Start server (default port 9333)
npm run start-server

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
- Registry of named terminals (Map<string, IPty>)
- Handles create/write/key/snapshot/resize operations

**Client** (`src/client.ts`):

- TypeScript client for the HTTP API
- Methods: createTerminal, write, key, snapshot, resize, waitForText, waitForExit

**Types** (`src/types.ts`):

- Shared request/response interfaces
- SpecialKeys mapping (arrows, ctrl combos, function keys)

## Key Patterns

- **Path aliases**: `@/` maps to `./src/` (configured in package.json and tsconfig.json)
- **ES modules**: Project uses `"type": "module"`
- **node-pty**: Core dependency for PTY spawning

## TypeScript Notes

- Use `import type` for type-only imports
- Strict mode enabled
- Target: ES2022, Module: NodeNext
