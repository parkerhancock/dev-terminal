/**
 * dev-terminal server: manages persistent PTY sessions via HTTP API.
 */

import express, { type Express, type Request, type Response } from "express";
import * as pty from "node-pty";
import type { IPty } from "node-pty";
import type { Socket } from "net";
import stripAnsi from "strip-ansi";
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  ListTerminalsResponse,
  WriteRequest,
  WriteResponse,
  ResizeRequest,
  ResizeResponse,
  SnapshotResponse,
  ServerInfoResponse,
  TerminalSize,
} from "./types.js";

export type { TerminalSize };

export interface ServeOptions {
  port?: number;
}

export interface DevTerminalServer {
  port: number;
  stop: () => Promise<void>;
}

interface TerminalEntry {
  pty: IPty;
  name: string;
  buffer: string;
  maxBufferSize: number;
  alive: boolean;
  exitCode?: number;
  size: TerminalSize;
}

const DEFAULT_SHELL = process.platform === "win32" ? "powershell.exe" : "bash";
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;
const MAX_BUFFER_SIZE = 100000; // ~100KB of scrollback

export async function serve(options: ServeOptions = {}): Promise<DevTerminalServer> {
  const port = options.port ?? 9333;

  // Registry: name -> TerminalEntry
  const registry = new Map<string, TerminalEntry>();

  const app: Express = express();
  app.use(express.json());

  // GET / - server info
  app.get("/", (_req: Request, res: Response) => {
    const response: ServerInfoResponse = {
      version: "0.1.0",
      terminals: registry.size,
    };
    res.json(response);
  });

  // GET /terminals - list all terminals
  app.get("/terminals", (_req: Request, res: Response) => {
    const response: ListTerminalsResponse = {
      terminals: Array.from(registry.keys()),
    };
    res.json(response);
  });

  // POST /terminals - get or create terminal
  app.post("/terminals", (req: Request, res: Response) => {
    const body = req.body as CreateTerminalRequest;
    const { name, command, args, cols, rows, cwd, env } = body;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required and must be a string" });
      return;
    }

    if (name.length === 0 || name.length > 256) {
      res.status(400).json({ error: "name must be 1-256 characters" });
      return;
    }

    // Check if terminal already exists
    let entry = registry.get(name);
    if (entry) {
      const response: CreateTerminalResponse = {
        name,
        pid: entry.pty.pid,
        size: entry.size,
      };
      res.json(response);
      return;
    }

    // Create new terminal
    const termCols = cols ?? DEFAULT_COLS;
    const termRows = rows ?? DEFAULT_ROWS;
    const shell = command ?? DEFAULT_SHELL;
    const shellArgs = args ?? [];

    try {
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: "xterm-256color",
        cols: termCols,
        rows: termRows,
        cwd: cwd ?? process.cwd(),
        env: { ...process.env, ...env } as Record<string, string>,
      });

      entry = {
        pty: ptyProcess,
        name,
        buffer: "",
        maxBufferSize: MAX_BUFFER_SIZE,
        alive: true,
        size: { cols: termCols, rows: termRows },
      };

      // Capture output to buffer
      ptyProcess.onData((data: string) => {
        if (entry) {
          entry.buffer += data;
          // Trim buffer if too large (keep most recent)
          if (entry.buffer.length > entry.maxBufferSize) {
            entry.buffer = entry.buffer.slice(-entry.maxBufferSize);
          }
        }
      });

      // Track exit
      ptyProcess.onExit(({ exitCode }) => {
        if (entry) {
          entry.alive = false;
          entry.exitCode = exitCode;
        }
      });

      registry.set(name, entry);

      const response: CreateTerminalResponse = {
        name,
        pid: ptyProcess.pid,
        size: entry.size,
      };
      res.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Failed to spawn terminal: ${message}` });
    }
  });

  // DELETE /terminals/:name - kill terminal
  app.delete("/terminals/:name", (req: Request<{ name: string }>, res: Response) => {
    const name = decodeURIComponent(req.params.name);
    const entry = registry.get(name);

    if (!entry) {
      res.status(404).json({ error: "terminal not found" });
      return;
    }

    try {
      entry.pty.kill();
    } catch {
      // Already dead
    }
    registry.delete(name);
    res.json({ success: true });
  });

  // POST /terminals/:name/write - send input
  app.post("/terminals/:name/write", (req: Request<{ name: string }>, res: Response) => {
    const name = decodeURIComponent(req.params.name);
    const entry = registry.get(name);

    if (!entry) {
      res.status(404).json({ error: "terminal not found" });
      return;
    }

    const body = req.body as WriteRequest;
    const { data } = body;

    if (typeof data !== "string") {
      res.status(400).json({ error: "data must be a string" });
      return;
    }

    if (!entry.alive) {
      res.status(400).json({ error: "terminal has exited" });
      return;
    }

    entry.pty.write(data);

    const response: WriteResponse = {
      success: true,
      bytesWritten: data.length,
    };
    res.json(response);
  });

  // POST /terminals/:name/resize - resize terminal
  app.post("/terminals/:name/resize", (req: Request<{ name: string }>, res: Response) => {
    const name = decodeURIComponent(req.params.name);
    const entry = registry.get(name);

    if (!entry) {
      res.status(404).json({ error: "terminal not found" });
      return;
    }

    const body = req.body as ResizeRequest;
    const { cols, rows } = body;

    if (typeof cols !== "number" || typeof rows !== "number") {
      res.status(400).json({ error: "cols and rows must be numbers" });
      return;
    }

    entry.pty.resize(cols, rows);
    entry.size = { cols, rows };

    const response: ResizeResponse = {
      success: true,
      size: entry.size,
    };
    res.json(response);
  });

  // GET /terminals/:name/snapshot - get screen state
  app.get("/terminals/:name/snapshot", (req: Request<{ name: string }>, res: Response) => {
    const name = decodeURIComponent(req.params.name);
    const entry = registry.get(name);

    if (!entry) {
      res.status(404).json({ error: "terminal not found" });
      return;
    }

    const raw = entry.buffer;
    const text = stripAnsi(raw);

    // Split into lines, taking last N lines based on terminal height
    // But also include some scrollback
    const allLines = text.split("\n");
    const maxLines = entry.size.rows * 3; // 3x terminal height for context
    const lines = allLines.slice(-maxLines);

    const response: SnapshotResponse = {
      text,
      raw,
      lines,
      size: entry.size,
      alive: entry.alive,
      exitCode: entry.exitCode,
    };
    res.json(response);
  });

  // POST /terminals/:name/clear - clear buffer
  app.post("/terminals/:name/clear", (req: Request<{ name: string }>, res: Response) => {
    const name = decodeURIComponent(req.params.name);
    const entry = registry.get(name);

    if (!entry) {
      res.status(404).json({ error: "terminal not found" });
      return;
    }

    entry.buffer = "";
    res.json({ success: true });
  });

  // Start server
  const server = app.listen(port, () => {
    console.log(`dev-terminal server running on http://localhost:${port}`);
    console.log("Ready");
  });

  // Track connections for clean shutdown
  const connections = new Set<Socket>();
  server.on("connection", (socket: Socket) => {
    connections.add(socket);
    socket.on("close", () => connections.delete(socket));
  });

  let cleaningUp = false;

  const cleanup = async () => {
    if (cleaningUp) return;
    cleaningUp = true;

    console.log("\nShutting down...");

    // Close connections
    for (const socket of connections) {
      socket.destroy();
    }
    connections.clear();

    // Kill all terminals
    for (const entry of registry.values()) {
      try {
        entry.pty.kill();
      } catch {
        // Already dead
      }
    }
    registry.clear();

    server.close();
    console.log("Server stopped.");
  };

  // Signal handlers
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const signalHandler = async () => {
    await cleanup();
    process.exit(0);
  };

  signals.forEach((sig) => process.on(sig, signalHandler));

  const removeHandlers = () => {
    signals.forEach((sig) => process.off(sig, signalHandler));
  };

  return {
    port,
    async stop() {
      removeHandlers();
      await cleanup();
    },
  };
}
