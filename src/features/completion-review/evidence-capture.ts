/**
 * Minimal programmatic evidence capture.
 *
 * DESIGN — reconciling two constraints that look opposed:
 *   (1) the helper must be invocable from a QA scenario via bash, and
 *   (2) the repo forbids `mkdir`/`touch`/`writeFileSync`/`rmSync` in TypeScript
 *       (AGENTS.md, "File ops in code — use bash tool").
 *
 * Resolution: option (i). This module contains NO filesystem primitives at all.
 * `buildCaptureCommand` returns a *shell one-liner* — the agent pastes it into
 * the bash tool, and the SHELL performs the mkdir and the redirect. The
 * TypeScript side only does string building and parsing, both pure.
 *
 * The record header (`command:` / `exit:` / `output_bytes:`) is what makes a
 * future evidence file MACHINE-WRITTEN, so `parseCaptureRecord` can tell it
 * apart from the pre-existing convention-only corpus. This is a command
 * recorder, deliberately not a test-runner framework.
 *
 * Output size is measured in bytes by the shell (`wc -c`), and the TS parser
 * re-derives nothing — it only reads the recorded number.
 */
export interface CaptureRecord {
  command: string
  exitCode: number
  outputBytes: number
}

export interface CaptureInput {
  /** Plan bucket, i.e. the plan's file name without `.md`. */
  plan: string
  /** Task identifier, e.g. `task-8`. */
  task: string
  /** Kebab-case slug describing what the command proves. */
  slug: string
  /** The command to run, e.g. `bun run typecheck`. */
  command: string
}

export function evidenceFileName(input: Pick<CaptureInput, "plan" | "task" | "slug">): string {
  return `.matrixx/evidence/${input.plan}/${input.task}-${input.slug}.txt`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function buildCaptureCommand(input: CaptureInput): string {
  const target = evidenceFileName(input)
  const label = shellQuote(input.command)
  return [
    `mkdir -p "$(dirname ${target})" && { out=$(eval ${label} 2>&1); rc=$?;`,
    `  printf 'command: %s\\n' ${label};`,
    `  printf 'exit: %s\\n' "$rc";`,
    `  printf 'output_bytes: %s\\n' "$(printf '%s' "$out" | wc -c)";`,
    `  printf 'output:\\n%s\\n' "$out";`,
    `} > ${target}`,
  ].join(" ")
}

export function parseCaptureRecord(content: string): CaptureRecord | null {
  const command = content.match(/^command:\s*(.+)$/m)?.[1]?.trim()
  const exitCode = content.match(/^exit:\s*(\d+)$/m)?.[1]
  const outputBytes = content.match(/^output_bytes:\s*(\d+)$/m)?.[1]
  if (command === undefined || exitCode === undefined || outputBytes === undefined) return null
  return { command, exitCode: Number(exitCode), outputBytes: Number(outputBytes) }
}
