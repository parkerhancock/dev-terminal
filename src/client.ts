/**
 * dev-terminal client: connect to server and interact with terminals.
 */

import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  ListTerminalsResponse,
  WriteResponse,
  ResizeResponse,
  SnapshotResponse,
  SnapshotFormat,
  ServerInfoResponse,
  TerminalSize,
  SpecialKeyName,
  SshOptions,
} from "./types.js";
import { SpecialKeys } from "./types.js";

export { SpecialKeys };
export type { SpecialKeyName, SshOptions };

export interface TerminalOptions {
  /** Command to run (default: bash or powershell) */
  command?: string;
  /** Arguments to pass to command */
  args?: string[];
  /** Terminal width in columns (default: 120) */
  cols?: number;
  /** Terminal height in rows (default: 40) */
  rows?: number;
  /** Working directory */
  cwd?: string;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** SSH connection options (for remote terminals) */
  ssh?: SshOptions;
}

export interface SnapshotOptions {
  /** Output format: "json" (default) or "svg" */
  format?: SnapshotFormat;
}

export interface Terminal {
  /** Terminal name */
  name: string;
  /** Process ID (undefined for SSH terminals) */
  pid?: number;
  /** Current size */
  size: TerminalSize;

  /** Write raw data to terminal */
  write: (data: string) => Promise<void>;

  /** Send a special key by name */
  key: (keyName: SpecialKeyName) => Promise<void>;

  /** Send a line (with Enter) */
  writeLine: (line: string) => Promise<void>;

  /** Get current screen snapshot */
  snapshot: (options?: SnapshotOptions) => Promise<SnapshotResponse>;

  /** Resize terminal */
  resize: (cols: number, rows: number) => Promise<TerminalSize>;

  /** Clear the output buffer */
  clear: () => Promise<void>;

  /** Wait for specific text to appear (polling) */
  waitForText: (text: string, options?: WaitOptions) => Promise<boolean>;

  /** Wait for process to exit */
  waitForExit: (options?: WaitOptions) => Promise<number | undefined>;
}

export interface WaitOptions {
  /** Timeout in ms (default: 30000) */
  timeout?: number;
  /** Poll interval in ms (default: 100) */
  interval?: number;
}

export interface DevTerminalClient {
  /** Get or create a named terminal */
  terminal: (name: string, options?: TerminalOptions) => Promise<Terminal>;

  /** List all terminal names */
  list: () => Promise<string[]>;

  /** Close/kill a terminal */
  close: (name: string) => Promise<void>;

  /** Disconnect from server (terminals keep running) */
  disconnect: () => void;

  /** Get server info */
  info: () => Promise<ServerInfoResponse>;
}

export async function connect(serverUrl = "http://localhost:9333"): Promise<DevTerminalClient> {
  // Helper for fetch with error handling
  async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${serverUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`API error ${res.status}: ${errorBody}`);
    }

    return res.json() as Promise<T>;
  }

  // Create Terminal wrapper
  function createTerminal(info: CreateTerminalResponse): Terminal {
    const { name, pid, size } = info;
    let currentSize = size;

    return {
      name,
      pid,
      get size() {
        return currentSize;
      },

      async write(data: string): Promise<void> {
        await apiFetch<WriteResponse>(`/terminals/${encodeURIComponent(name)}/write`, {
          method: "POST",
          body: JSON.stringify({ data }),
        });
      },

      async key(keyName: SpecialKeyName): Promise<void> {
        const sequence = SpecialKeys[keyName];
        if (!sequence) {
          throw new Error(`Unknown key: ${keyName}`);
        }
        await this.write(sequence);
      },

      async writeLine(line: string): Promise<void> {
        await this.write(line + "\r");
      },

      async snapshot(options: SnapshotOptions = {}): Promise<SnapshotResponse> {
        const params = new URLSearchParams();
        if (options.format) {
          params.set("format", options.format);
        }
        const query = params.toString();
        const url = `/terminals/${encodeURIComponent(name)}/snapshot${query ? `?${query}` : ""}`;
        return apiFetch<SnapshotResponse>(url);
      },

      async resize(cols: number, rows: number): Promise<TerminalSize> {
        const res = await apiFetch<ResizeResponse>(
          `/terminals/${encodeURIComponent(name)}/resize`,
          {
            method: "POST",
            body: JSON.stringify({ cols, rows }),
          }
        );
        currentSize = res.size;
        return res.size;
      },

      async clear(): Promise<void> {
        await apiFetch(`/terminals/${encodeURIComponent(name)}/clear`, {
          method: "POST",
        });
      },

      async waitForText(text: string, options: WaitOptions = {}): Promise<boolean> {
        const { timeout = 30000, interval = 100 } = options;
        const start = Date.now();

        while (Date.now() - start < timeout) {
          const snap = await this.snapshot();
          if (snap.text.includes(text)) {
            return true;
          }
          await new Promise((resolve) => setTimeout(resolve, interval));
        }

        return false;
      },

      async waitForExit(options: WaitOptions = {}): Promise<number | undefined> {
        const { timeout = 30000, interval = 100 } = options;
        const start = Date.now();

        while (Date.now() - start < timeout) {
          const snap = await this.snapshot();
          if (!snap.alive) {
            return snap.exitCode;
          }
          await new Promise((resolve) => setTimeout(resolve, interval));
        }

        return undefined;
      },
    };
  }

  return {
    async terminal(name: string, options: TerminalOptions = {}): Promise<Terminal> {
      const body: CreateTerminalRequest = {
        name,
        command: options.command,
        args: options.args,
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd,
        env: options.env,
        ssh: options.ssh,
      };

      const info = await apiFetch<CreateTerminalResponse>("/terminals", {
        method: "POST",
        body: JSON.stringify(body),
      });

      return createTerminal(info);
    },

    async list(): Promise<string[]> {
      const res = await apiFetch<ListTerminalsResponse>("/terminals");
      return res.terminals;
    },

    async close(name: string): Promise<void> {
      await apiFetch(`/terminals/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
    },

    disconnect(): void {
      // No persistent connection to close - HTTP is stateless
      // Terminals persist on server
    },

    async info(): Promise<ServerInfoResponse> {
      return apiFetch<ServerInfoResponse>("/");
    },
  };
}

/**
 * Wait a specified number of milliseconds.
 * Useful in scripts between actions.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
