export const PILOT_TOOL_ALLOWLIST_AGENTS = ["trinity", "operator", "oracle"] as const

export type PilotToolAllowlistAgent = (typeof PILOT_TOOL_ALLOWLIST_AGENTS)[number]

type ToolsMap = Record<string, boolean>

const READ_ONLY_SEARCH_TOOLS: ToolsMap = {
  read: true,
  glob: true,
  grep: true,
  list: true,
  lsp_goto_definition: true,
  lsp_find_references: true,
  lsp_symbols: true,
  lsp_diagnostics: true,
  ast_grep_search: true,
  github_search: true,
  session_list: true,
  session_read: true,
  session_search: true,
  session_info: true,
  write: false,
  edit: false,
  bash: false,
  patch: false,
}

export const DEFAULT_TOOL_ALLOWLIST: Record<PilotToolAllowlistAgent, ToolsMap> = {
  trinity: { ...READ_ONLY_SEARCH_TOOLS },
  operator: { ...READ_ONLY_SEARCH_TOOLS, webfetch: true, websearch: true },
  oracle: { ...READ_ONLY_SEARCH_TOOLS },
}

function agentToolsRecord(agent: unknown): ToolsMap | undefined {
  if (!agent || typeof agent !== "object") return undefined
  const entry = agent as { tools?: unknown }
  if (entry.tools === undefined) {
    entry.tools = {}
  }
  if (!entry.tools || typeof entry.tools !== "object") return undefined
  return entry.tools as ToolsMap
}

export function applyAgentToolAllowlist(params: {
  agentResult: Record<string, unknown>
  pluginConfig: { disabled_tools?: readonly string[] }
}): void {
  for (const name of PILOT_TOOL_ALLOWLIST_AGENTS) {
    const agent = params.agentResult[name]
    if (!agent || typeof agent !== "object") continue
    const tools = agentToolsRecord(agent)
    if (!tools) continue
    const defaults = DEFAULT_TOOL_ALLOWLIST[name]
    for (const [tool, value] of Object.entries(defaults)) {
      tools[tool] ??= value
    }
  }
  const disabled = params.pluginConfig.disabled_tools
  if (!disabled || disabled.length === 0) return
  for (const name of PILOT_TOOL_ALLOWLIST_AGENTS) {
    const agent = params.agentResult[name]
    if (!agent || typeof agent !== "object") continue
    const tools = agentToolsRecord(agent)
    if (!tools) continue
    for (const tool of disabled) {
      if (tool in tools) {
        tools[tool] = false
      } else if (Object.values(DEFAULT_TOOL_ALLOWLIST).some((d) => tool in d)) {
        tools[tool] = false
      }
    }
  }
}
