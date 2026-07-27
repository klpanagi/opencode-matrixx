#!/usr/bin/env bun
/**
 * Matrixx CLI entry point
 *
 * Run:
 *   ./bin/matrixx.ts doctor
 *   ./bin/matrixx.ts install --no-tui
 *   ./bin/matrixx.ts version
 *
 * Published as:
 *   bunx opencode-matrixx
 *   npx opencode-matrixx
 */

import main from "../src/cli/index"

await main()
