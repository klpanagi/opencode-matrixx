#!/usr/bin/env bun
/**
 * Matrixx CLI — `bunx opencode-matrixx <command>`
 *
 * Commands:
 *   doctor    - Environment diagnostics and health checks
 *   install   - Interactive setup wizard (--no-tui for CI)
 *   setup     - Standalone setup wizard for deps + matrixx.jsonc generation
 *   version   - Display version information
 *   help      - Display help information
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { executeDoctor } from "./doctor"
import { executeInstall } from "./install"
import { executeSetup } from "./setup"

function getVersion(): string {
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const candidates = [
      join(thisDir, "../../package.json"),
      join(thisDir, "../package.json"),
      "package.json",
    ]
    for (const p of candidates) {
      try {
        const raw = readFileSync(p, "utf-8")
        const pkg = JSON.parse(raw)
        if (pkg.version && typeof pkg.version === "string") return pkg.version
      } catch {}
    }
  } catch {}
  return "2.6.0"
}

const VERSION = getVersion()

function printHelp(): void {
  console.log(`
Matrixx CLI v${VERSION}

Usage: bunx opencode-matrixx <command> [options]

Commands:
  doctor     Environment diagnostics and health checks
  install    Interactive setup wizard
  setup      Standalone setup wizard for deps + matrixx.jsonc generation
  version    Display version information
  help       Display this help message

Options:
  --help, -h    Show help for any command
  --json        (doctor) Output results as JSON
  --category    (doctor) Check specific category only
  --no-tui      (install) Run in non-interactive mode (CI/CD)
  --local       (install) Use local repo file:// path (dev only)
  --verbose     (install) Display detailed logs
  --yes, -y     (setup) Non-interactive defaults (no prompts)
  --dry-run     (setup) Preview changes without writing

Doctor categories:
  installation   Plugin registration and OpenCode version
  configuration  Config file validation
  authentication Provider API key status
  dependencies   Runtime dependencies (Bun, Node, Git, Python)
  tools          Optional tools (ast-grep, Gitleaks, PyMuPDF, Playwright)

Subscription flags (install --no-tui):
  --claude=<yes|no|max20>
  --openai=<yes|no>
  --gemini=<yes|no>
  --copilot=<yes|no>
  --opencode-zen=<yes|no>
  --zai-coding-plan=<yes|no>
    `)
}

interface ParsedArgs {
  command: string
  help: boolean
  json: boolean
  category?: string
  noTui: boolean
  verbose: boolean
  local: boolean
  yes: boolean
  dryRun: boolean
  claude?: "yes" | "no" | "max20"
  openai?: "yes" | "no"
  gemini?: "yes" | "no"
  copilot?: "yes" | "no"
  opencodeZen?: "yes" | "no"
  zaiCodingPlan?: "yes" | "no"
  extra: string[]
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: "",
    help: false,
    json: false,
    noTui: false,
    verbose: false,
    local: false,
    yes: false,
    dryRun: false,
    extra: [],
  }

  let args = argv.slice(2)
  if (args.length === 0) {
    result.help = true
    return result
  }

  result.command = args[0]
  args = args.slice(1)

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--help" || a === "-h") {
      result.help = true
    } else if (a === "--json") {
      result.json = true
    } else if (a === "--yes" || a === "-y") {
      result.yes = true
    } else if (a === "--dry-run") {
      result.dryRun = true
    } else if (a === "--no-tui") {
      result.noTui = true
    } else if (a === "--local") {
      result.local = true
    } else if (a === "--verbose") {
      result.verbose = true
    } else if (a.startsWith("--category=")) {
      result.category = a.slice("--category=".length)
    } else if (a === "--category" && i + 1 < args.length) {
      result.category = args[++i]
    } else if (a.startsWith("--claude=")) {
      const v = a.slice("--claude=".length) as "yes" | "no" | "max20"
      if (["yes", "no", "max20"].includes(v)) result.claude = v
    } else if (a.startsWith("--openai=")) {
      const v = a.slice("--openai=".length) as "yes" | "no"
      if (["yes", "no"].includes(v)) result.openai = v
    } else if (a.startsWith("--gemini=")) {
      const v = a.slice("--gemini=".length) as "yes" | "no"
      if (["yes", "no"].includes(v)) result.gemini = v
    } else if (a.startsWith("--copilot=")) {
      const v = a.slice("--copilot=".length) as "yes" | "no"
      if (["yes", "no"].includes(v)) result.copilot = v
    } else if (a.startsWith("--opencode-zen=")) {
      const v = a.slice("--opencode-zen=".length) as "yes" | "no"
      if (["yes", "no"].includes(v)) result.opencodeZen = v
    } else if (a.startsWith("--zai-coding-plan=")) {
      const v = a.slice("--zai-coding-plan=".length) as "yes" | "no"
      if (["yes", "no"].includes(v)) result.zaiCodingPlan = v
    } else {
      result.extra.push(a)
    }
  }

  return result
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)

  if (!args.command || args.command === "help" || args.help) {
    printHelp()
    return
  }

  if (args.command === "version") {
    console.log(VERSION)
    return
  }

  if (args.command === "doctor") {
    const output = await executeDoctor({
      category: args.category,
      json: args.json,
    })
    console.log(output)
    return
  }

  if (args.command === "install") {
    const output = await executeInstall({
      noTui: args.noTui,
      verbose: args.verbose,
      local: args.local,
      claude: args.claude,
      openai: args.openai,
      gemini: args.gemini,
      copilot: args.copilot,
      opencodeZen: args.opencodeZen,
      zaiCodingPlan: args.zaiCodingPlan,
    })
    console.log(output)
    return
  }

  if (args.command === "setup") {
    const output = await executeSetup({ dryRun: args.dryRun, yes: args.yes })
    console.log(output)
    return
  }

  console.error(`Unknown command: ${args.command}\n`)
  printHelp()
  process.exit(1)
}

export { main }
export default main

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal error:", err)
    process.exit(1)
  })
}
