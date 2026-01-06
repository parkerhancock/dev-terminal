#!/usr/bin/env npx tsx
/**
 * Start the dev-terminal server.
 *
 * Usage: npx tsx scripts/start-server.ts [--headed]
 *
 * Options:
 *   --headed  Open browser UI for watching terminals
 */

import { serve } from "../src/index.js";

const args = process.argv.slice(2);
const headed = args.includes("--headed");
const port = parseInt(process.env.PORT ?? "9333", 10);

console.log("Starting dev-terminal server...");

serve({ port, headed }).catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
