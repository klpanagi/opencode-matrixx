/**
 * Shared routing block for context-mode guidance.
 *
 * Port of upstream `context-mode` `hooks/routing-block.mjs:16-80` (the
 * `<context_window_protection>` block) plus the Matrixx carve-out sentences
 * defined in `src/hooks/context-mode-enforcer/constants.ts` (T3) — Read stays
 * correct for Edit, and shell stays correct for OBSERVE / MUTATE.
 *
 * Matrixx ships the context-mode tools under their bare `ctx_*` names, so the
 * upstream tool-namer indirection collapses to direct references here.
 */

export const MATRIXX_CONTEXT_MODE_MARKER = "<context_window_protection>"

/**
 * Build the full routing block that is injected into the system prompt.
 * Idempotence is the caller's concern: check for {@link MATRIXX_CONTEXT_MODE_MARKER}
 * before inserting, using {@link containsContextModeMarker}.
 */
export function buildContextModeRoutingBlock(): string {
  return `${MATRIXX_CONTEXT_MODE_MARKER}
  <priority_instructions>
    Every byte a tool returns enters your conversation memory and costs reasoning capacity for the rest of the session. The context-mode tools let you do the work in a sandbox and surface only the derived answer — the raw bytes stay out. Think-in-Code: program the analysis, do not compute it by reading raw data into your conversation.
  </priority_instructions>

  <tool_selection_hierarchy>
    0. MEMORY: ctx_search(sort: "timeline")
       - On resume or compaction, query prior decisions, errors, plans, user prompts before asking the user — auto-captured session memory is searchable.
    1. GATHER: ctx_batch_execute(commands, queries)
       - Primary research tool. Runs commands in parallel, auto-indexes each output, and (when queries are passed) returns matching sections in the same round trip — no follow-up search call.
       - Each command: {label: "section header", command: "shell command"}; the label becomes the FTS5 chunk title — descriptive labels improve search.
    2. FOLLOW-UP: ctx_search(queries: ["q1", "q2", ...])
       - Multiple related questions about anything already indexed (your captures + session memory). Batch every question in one array; the ranking pipeline runs per-query and the round-trip cost is paid once.
    3. PROCESSING: ctx_execute(language, code) | ctx_execute_file(path, language, code)
       - Derive answers FROM data: filter, count, aggregate, parse, transform. Only what you console.log() enters your conversation; the raw bytes stay in the sandbox.
  </tool_selection_hierarchy>

  <when_not_to_use>
    - You intend to PROCESS the output (filter, count, parse, aggregate) → use ctx_batch_execute or ctx_execute. Shell stays correct when you intend to OBSERVE a short fixed output (git status on a clean tree, whoami, pwd) or when you MUTATE state (git, mkdir, rm, mv, navigation).
    - You want to analyze, summarize, or extract from a file → use ctx_execute_file. Read is CORRECT when you intend to Edit the file (Edit needs the exact bytes in your conversation to match against; hashline IDs for Edit on non-plan paths, .matrixx/plans/*.md must use plan_read/plan_update).
    - Raw grep/glob → use ctx_search for indexed-KB hits, or ctx_batch_execute / ctx_execute running shell \`rg\` for codebase search. Raw grep/glob bypasses the FTS5 sandbox and pollutes context.
    - WebFetch → use ctx_fetch_and_index; full network access, results indexed for ctx_search, raw page bytes never enter your conversation.
    - ctx_execute and ctx_execute_file for file writes → these run code in a subprocess and discard the sandbox FS; they are for analysis, processing, and computation only.
  </when_not_to_use>

  <file_writing_policy>
    File writes use the native Write or Edit tool — ctx_execute, ctx_execute_file, and Bash subprocesses do not persist edits to the host filesystem.
    Applies to all file types: code, configs, plans, specs, YAML, JSON, markdown.
  </file_writing_policy>

  <output_constraints>
    <artifact_policy>
      Write artifacts (code, configs, PRDs) to files. Return only: file path + 1-line description.
    </artifact_policy>
  </output_constraints>

  <session_continuity>
    Skills, roles, and decisions captured earlier in this session are a memory aid, not a standing order. Treat them as context that may help: the user's most recent message always takes precedence. If a captured directive conflicts with what the user now asks, follow the user; a past phrase does not bind you.
  </session_continuity>

  <ctx_commands>
    "ctx stats" | "ctx-stats" | "/ctx-stats" | context savings question
    → Call stats MCP tool, display full output verbatim.

    "ctx doctor" | "ctx-doctor" | "/ctx-doctor" | diagnose context-mode
    → Call doctor MCP tool, run returned shell command, display as checklist.

    "ctx upgrade" | "ctx-upgrade" | "/ctx-upgrade" | update context-mode
    → Call upgrade MCP tool, run returned shell command, display as checklist.

    "ctx purge" | "ctx-purge" | "/ctx-purge" | wipe/reset knowledge base
    → Call purge MCP tool with confirm: true. Warn: irreversible.

    After /clear or /compact: knowledge base preserved. Tell user: "context-mode knowledge base preserved. Use \`ctx purge\` to start fresh."
  </ctx_commands>
</context_window_protection>`
}

/**
 * True when the marker is already present in any system message — used for
 * idempotence so the block is never injected twice into the same prompt.
 */
export function containsContextModeMarker(system: readonly string[]): boolean {
  return system.some((message) => typeof message === "string" && message.includes(MATRIXX_CONTEXT_MODE_MARKER))
}
