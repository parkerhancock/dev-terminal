/**
 * Shared types for dev-terminal server and client.
 */

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface SshOptions {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  agent?: string;
}

export interface CreateTerminalRequest {
  name: string;
  command?: string;
  args?: string[];
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
  ssh?: SshOptions;
}

export interface CreateTerminalResponse {
  name: string;
  pid?: number;
  size: TerminalSize;
}

export interface ListTerminalsResponse {
  terminals: string[];
}

export interface WriteRequest {
  data: string;
}

export interface WriteResponse {
  success: boolean;
  bytesWritten: number;
}

export interface ResizeRequest {
  cols: number;
  rows: number;
}

export interface ResizeResponse {
  success: boolean;
  size: TerminalSize;
}

export type SnapshotFormat = "json" | "svg";

export interface SnapshotResponse {
  /** Plain text content (ANSI codes stripped) */
  text: string;
  /** Raw content with ANSI codes */
  raw: string;
  /** Screen as array of lines */
  lines: string[];
  /** Terminal size */
  size: TerminalSize;
  /** Whether the process is still running */
  alive: boolean;
  /** Exit code if process has exited */
  exitCode?: number;
  /** SVG rendering (only if format=svg requested) */
  svg?: string;
}

export interface ServerInfoResponse {
  version: string;
  terminals: number;
}

export interface ErrorResponse {
  error: string;
}

/**
 * Special key mappings for convenience.
 * Use these with term.key() instead of raw escape sequences.
 */
export const SpecialKeys = {
  // Arrow keys
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",

  // Control keys
  enter: "\r",
  tab: "\t",
  escape: "\x1b",
  backspace: "\x7f",
  delete: "\x1b[3~",

  // Ctrl combinations
  "ctrl+c": "\x03",
  "ctrl+d": "\x04",
  "ctrl+z": "\x1a",
  "ctrl+l": "\x0c",
  "ctrl+a": "\x01",
  "ctrl+e": "\x05",
  "ctrl+k": "\x0b",
  "ctrl+u": "\x15",
  "ctrl+w": "\x17",
  "ctrl+r": "\x12",

  // Function keys
  f1: "\x1bOP",
  f2: "\x1bOQ",
  f3: "\x1bOR",
  f4: "\x1bOS",
  f5: "\x1b[15~",
  f6: "\x1b[17~",
  f7: "\x1b[18~",
  f8: "\x1b[19~",
  f9: "\x1b[20~",
  f10: "\x1b[21~",
  f11: "\x1b[23~",
  f12: "\x1b[24~",

  // Navigation
  home: "\x1b[H",
  end: "\x1b[F",
  pageup: "\x1b[5~",
  pagedown: "\x1b[6~",
  insert: "\x1b[2~",
} as const;

export type SpecialKeyName = keyof typeof SpecialKeys;
