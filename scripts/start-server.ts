#!/usr/bin/env npx tsx
/**
 * Start the dev-terminal server.
 */

import { serve } from "../src/index.js";

const port = parseInt(process.env.PORT ?? "9333", 10);

console.log("Starting dev-terminal server...");

serve({ port }).catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
