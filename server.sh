#!/bin/bash
# Start the dev-terminal server
# Usage: ./server.sh [--headed]
cd "$(dirname "$0")"
npx tsx scripts/start-server.ts "$@"
