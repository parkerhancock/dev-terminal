/**
 * Terminal backend abstraction for local (node-pty) and remote (ssh2) terminals.
 */

import * as pty from "node-pty";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";

/**
 * Common interface for terminal backends.
 */
export interface TerminalBackend {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (exitCode?: number) => void): void;
  readonly pid?: number;
}

/**
 * Options for creating a local PTY terminal.
 */
export interface LocalPtyOptions {
  command: string;
  args: string[];
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
}

/**
 * SSH connection options.
 */
export interface SshOptions {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  agent?: string;
}

/**
 * Options for creating an SSH terminal.
 */
export interface SshPtyOptions {
  ssh: SshOptions;
  cols: number;
  rows: number;
}

/**
 * Local PTY backend using node-pty.
 */
export class LocalPtyBackend implements TerminalBackend {
  private ptyProcess: pty.IPty;

  constructor(options: LocalPtyOptions) {
    this.ptyProcess = pty.spawn(options.command, options.args, {
      name: "xterm-256color",
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: options.env,
    });
  }

  get pid(): number {
    return this.ptyProcess.pid;
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
  }

  kill(): void {
    this.ptyProcess.kill();
  }

  onData(callback: (data: string) => void): void {
    this.ptyProcess.onData(callback);
  }

  onExit(callback: (exitCode?: number) => void): void {
    this.ptyProcess.onExit(({ exitCode }) => callback(exitCode));
  }
}

/**
 * SSH PTY backend using ssh2.
 * Returns a Promise that resolves when connected.
 */
export class SshPtyBackend implements TerminalBackend {
  private conn: Client;
  private stream: ClientChannel | null = null;
  private dataCallback: ((data: string) => void) | null = null;
  private exitCallback: ((exitCode?: number) => void) | null = null;
  private _cols: number;
  private _rows: number;

  private constructor(cols: number, rows: number) {
    this.conn = new Client();
    this._cols = cols;
    this._rows = rows;
  }

  /**
   * Create and connect an SSH terminal.
   * @throws Error if connection or shell fails
   */
  static async create(options: SshPtyOptions): Promise<SshPtyBackend> {
    const backend = new SshPtyBackend(options.cols, options.rows);
    await backend.connect(options.ssh);
    return backend;
  }

  private connect(ssh: SshOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const config: ConnectConfig = {
        host: ssh.host,
        port: ssh.port ?? 22,
        username: ssh.username,
        readyTimeout: 30000,
      };

      // Authentication: try agent, then key, then password
      if (ssh.agent) {
        config.agent = ssh.agent;
      }
      if (ssh.privateKey) {
        config.privateKey = ssh.privateKey;
        if (ssh.passphrase) {
          config.passphrase = ssh.passphrase;
        }
      }
      if (ssh.password) {
        config.password = ssh.password;
      }

      this.conn.on("ready", () => {
        this.conn.shell(
          {
            term: "xterm-256color",
            cols: this._cols,
            rows: this._rows,
          },
          (err, stream) => {
            if (err) {
              this.conn.end();
              reject(new Error(`Failed to start shell: ${err.message}`));
              return;
            }

            this.stream = stream;

            stream.on("data", (data: Buffer) => {
              if (this.dataCallback) {
                this.dataCallback(data.toString());
              }
            });

            stream.on("close", () => {
              if (this.exitCallback) {
                this.exitCallback(0);
              }
              this.conn.end();
            });

            stream.stderr.on("data", (data: Buffer) => {
              // Merge stderr into stdout for terminal display
              if (this.dataCallback) {
                this.dataCallback(data.toString());
              }
            });

            resolve();
          }
        );
      });

      this.conn.on("error", (err) => {
        reject(new Error(`SSH connection failed: ${err.message}`));
      });

      this.conn.on("close", () => {
        if (this.exitCallback) {
          this.exitCallback();
        }
      });

      this.conn.connect(config);
    });
  }

  get pid(): undefined {
    return undefined; // SSH terminals don't have a local PID
  }

  write(data: string): void {
    if (this.stream) {
      this.stream.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    this._cols = cols;
    this._rows = rows;
    if (this.stream) {
      this.stream.setWindow(rows, cols, 0, 0);
    }
  }

  kill(): void {
    if (this.stream) {
      this.stream.end();
    }
    this.conn.end();
  }

  onData(callback: (data: string) => void): void {
    this.dataCallback = callback;
  }

  onExit(callback: (exitCode?: number) => void): void {
    this.exitCallback = callback;
  }
}
