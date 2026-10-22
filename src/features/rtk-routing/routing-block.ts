/**
 * Shared routing block for RTK shell discipline.
 *
 * Short reminder (per D3: ≤12 content lines) injected into the system prompt
 * when RTK enforcement is active. Mentions only `rtk` + the rewriter hook;
 * never other routing blocks or ctx tools.
 */

export const MATRIXX_RTK_MARKER = "<rtk_discipline>"

/**
 * Build the full routing block that is injected into the system prompt.
 * Idempotence is the caller's concern: check for {@link MATRIXX_RTK_MARKER}
 * before inserting, using {@link containsRtkMarker}.
 */
export function buildRtkRoutingBlock(): string {
  return `${MATRIXX_RTK_MARKER}
  Prefer \`rtk <cmd>\` for all supported commands (git, ls, cat, head, tail, grep, rg, find, wc, etc.).
  The rtk-bash-rewriter hook auto-rewrites eligible bash commands; do not disable or bypass it.
  If a command is not rewritten, prefix it with \`rtk\` manually when an rtk equivalent exists.
  Never run a raw command when an rtk equivalent is available.
</rtk_discipline>`
}

/**
 * True when the marker is already present in any system message — used for
 * idempotence so the block is never injected twice into the same prompt.
 */
export function containsRtkMarker(system: readonly string[]): boolean {
  return system.some((message) => typeof message === "string" && message.includes(MATRIXX_RTK_MARKER))
}
