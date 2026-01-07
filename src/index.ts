/**
 * dev-terminal server: manages persistent PTY sessions via HTTP API.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { exec } from "child_process";
import express, { type Express, type Request, type Response } from "express";
import type { Socket } from "net";
import { WebSocketServer, WebSocket } from "ws";
import stripAnsi from "strip-ansi";
import { AnsiUp } from "ansi_up";
import { LocalPtyBackend, SshPtyBackend, type TerminalBackend } from "./backend.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  ListTerminalsResponse,
  WriteRequest,
  WriteResponse,
  ResizeRequest,
  ResizeResponse,
  SnapshotResponse,
  SnapshotFormat,
  ServerInfoResponse,
  TerminalSize,
} from "./types.js";

export type { TerminalSize };

export interface ServeOptions {
  port?: number;
  /** Open browser UI for watching terminals */
  headed?: boolean;
}

export interface DevTerminalServer {
  port: number;
  stop: () => Promise<void>;
}

interface TerminalEntry {
  backend: TerminalBackend;
  name: string;
  buffer: string;
  maxBufferSize: number;
  alive: boolean;
  exitCode?: number;
  size: TerminalSize;
}

const DEFAULT_SHELL =
  process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "bash");
const DEFAULT_SHELL_ARGS = ["-l"]; // Login shell by default
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;
const MAX_BUFFER_SIZE = 100000; // ~100KB of scrollback

export async function serve(options: ServeOptions = {}): Promise<DevTerminalServer> {
  const port = options.port ?? 9333;
  const headed = options.headed ?? false;

  // Registry: name -> TerminalEntry
  const registry = new Map<string, TerminalEntry>();

  // WebSocket clients for headed mode
  const wsClients = new Set<WebSocket>();

  // Broadcast message to all WebSocket clients
  function broadcast(message: object) {
    const data = JSON.stringify(message);
    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  const app: Express = express();
  app.use(express.json());

  // Serve static files for headed mode
  const publicDir = join(__dirname, "..", "public");
  app.use(express.static(publicDir));

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
  app.post("/terminals", async (req: Request, res: Response) => {
    const body = req.body as CreateTerminalRequest;
    const { name, command, args, cols, rows, cwd, env, ssh } = body;

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
        pid: entry.backend.pid,
        size: entry.size,
      };
      res.json(response);
      return;
    }

    // Create new terminal
    const termCols = cols ?? DEFAULT_COLS;
    const termRows = rows ?? DEFAULT_ROWS;

    try {
      let backend: TerminalBackend;

      if (ssh) {
        // SSH terminal
        backend = await SshPtyBackend.create({
          ssh,
          cols: termCols,
          rows: termRows,
        });
      } else {
        // Local terminal
        const shell = command ?? DEFAULT_SHELL;
        const shellArgs = args ?? (command ? [] : DEFAULT_SHELL_ARGS);
        backend = new LocalPtyBackend({
          command: shell,
          args: shellArgs,
          cols: termCols,
          rows: termRows,
          cwd: cwd ?? process.cwd(),
          env: { ...process.env, ...env } as Record<string, string>,
        });
      }

      entry = {
        backend,
        name,
        buffer: "",
        maxBufferSize: MAX_BUFFER_SIZE,
        alive: true,
        size: { cols: termCols, rows: termRows },
      };

      // Capture output to buffer and broadcast to WebSocket clients
      backend.onData((data: string) => {
        if (entry) {
          entry.buffer += data;
          // Trim buffer if too large (keep most recent)
          if (entry.buffer.length > entry.maxBufferSize) {
            entry.buffer = entry.buffer.slice(-entry.maxBufferSize);
          }
          // Broadcast to WebSocket clients
          broadcast({ type: "data", name, data });
        }
      });

      // Track exit
      backend.onExit((exitCode) => {
        if (entry) {
          entry.alive = false;
          entry.exitCode = exitCode;
          broadcast({ type: "closed", name, exitCode });
        }
      });

      registry.set(name, entry);

      // Notify WebSocket clients of new terminal
      broadcast({ type: "created", name, size: entry.size });

      const response: CreateTerminalResponse = {
        name,
        pid: backend.pid,
        size: entry.size,
      };
      res.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Failed to create terminal: ${message}` });
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
      entry.backend.kill();
    } catch {
      // Already dead
    }
    registry.delete(name);
    broadcast({ type: "closed", name });
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

    entry.backend.write(data);

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

    entry.backend.resize(cols, rows);
    entry.size = { cols, rows };
    broadcast({ type: "resized", name, size: entry.size });

    const response: ResizeResponse = {
      success: true,
      size: entry.size,
    };
    res.json(response);
  });

  // GET /terminals/:name/snapshot - get screen state
  // Query params:
  //   format: "json" (default) | "svg"
  app.get("/terminals/:name/snapshot", (req: Request<{ name: string }>, res: Response) => {
    const name = decodeURIComponent(req.params.name);
    const entry = registry.get(name);

    if (!entry) {
      res.status(404).json({ error: "terminal not found" });
      return;
    }

    const format = (req.query.format as SnapshotFormat) || "json";
    const raw = entry.buffer;
    const text = stripAnsi(raw);

    // Split into lines, taking last N lines based on terminal height
    // But also include some scrollback
    const allLines = text.split("\n");
    const maxLines = entry.size.rows * 3; // 3x terminal height for context
    const lines = allLines.slice(-maxLines);

    // Generate SVG if requested
    let svg: string | undefined;
    if (format === "svg") {
      try {
        // Use the raw ANSI content for SVG rendering
        // Take only visible screen portion for cleaner SVG
        const rawLines = raw.split("\n");
        const visibleRaw = rawLines.slice(-entry.size.rows).join("\n");

        // Convert ANSI to HTML using ansi_up (supports 256-color and true color)
        const ansiUp = new AnsiUp();
        ansiUp.use_classes = false; // Use inline styles for colors
        const html = ansiUp.ansi_to_html(visibleRaw);

        // Calculate SVG dimensions
        const fontSize = 14;
        const lineHeight = 18;
        const charWidth = 8.4; // Approximate for monospace
        const padding = 10;
        const visibleLines = visibleRaw.split("\n");
        const maxLineLength = Math.max(...visibleLines.map((l) => stripAnsi(l).length), 1);
        const width = maxLineLength * charWidth + padding * 2;
        const height = visibleLines.length * lineHeight + padding * 2;

        // Create SVG with foreignObject for HTML content
        svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#000000"/>
  <foreignObject x="${padding}" y="${padding}" width="${width - padding * 2}" height="${height - padding * 2}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'SauceCodePro Nerd Font', 'Source Code Pro', 'Courier New', monospace; font-size: ${fontSize}px; line-height: ${lineHeight}px; color: #D3D3D3; white-space: pre; background: transparent;">${html}</div>
  </foreignObject>
</svg>`;
      } catch (err) {
        // If SVG rendering fails, continue without it
        console.error("SVG rendering failed:", err);
      }
    }

    const response: SnapshotResponse = {
      text,
      raw,
      lines,
      size: entry.size,
      alive: entry.alive,
      exitCode: entry.exitCode,
      svg,
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
    if (headed) {
      console.log(`Opening browser UI at http://localhost:${port}`);
    }
    console.log("Ready");
  });

  // Set up WebSocket server
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    wsClients.add(ws);

    // Send current terminal list to new client
    const terminals = Array.from(registry.entries()).map(([name, entry]) => ({
      name,
      size: entry.size,
    }));
    ws.send(JSON.stringify({ type: "terminals", terminals }));

    // Send buffered content for each terminal
    for (const [name, entry] of registry.entries()) {
      if (entry.buffer) {
        ws.send(JSON.stringify({ type: "data", name, data: entry.buffer }));
      }
    }

    // Handle messages from client (keyboard input)
    ws.on("message", (message: Buffer) => {
      try {
        const msg = JSON.parse(message.toString());
        if (msg.type === "input" && msg.name && msg.data) {
          const entry = registry.get(msg.name);
          if (entry && entry.alive) {
            entry.backend.write(msg.data);
          }
        }
      } catch {
        // Ignore invalid messages
      }
    });

    ws.on("close", () => {
      wsClients.delete(ws);
    });
  });

  // Track connections for clean shutdown
  const connections = new Set<Socket>();
  server.on("connection", (socket: Socket) => {
    connections.add(socket);
    socket.on("close", () => connections.delete(socket));
  });

  // Open browser if headed mode
  if (headed) {
    const url = `http://localhost:${port}`;
    const openCommand =
      process.platform === "darwin"
        ? `open "${url}"`
        : process.platform === "win32"
          ? `start "${url}"`
          : `xdg-open "${url}"`;
    exec(openCommand);
  }

  let cleaningUp = false;

  const cleanup = async () => {
    if (cleaningUp) return;
    cleaningUp = true;

    console.log("\nShutting down...");

    // Close WebSocket connections
    for (const ws of wsClients) {
      ws.close();
    }
    wsClients.clear();
    wss.close();

    // Close HTTP connections
    for (const socket of connections) {
      socket.destroy();
    }
    connections.clear();

    // Kill all terminals
    for (const entry of registry.values()) {
      try {
        entry.backend.kill();
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
