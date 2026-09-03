import type { CheckResult, DoctorCheck } from "../types"

function checkUvxVersion(): string | null {
  if (!Bun.which("uvx")) return null
  try {
    const r = Bun.spawnSync(["uvx", "--version"], { stdout: "pipe", stderr: "pipe" })
    if (r.exitCode === 0) return r.stdout.toString().trim().split("\n")[0]?.replace(/^uvx\s+/i, "") || "unknown"
  } catch { void 0 }
  return null
}

export const mcpPrerequisitesCheck: DoctorCheck = {
  name: "mcp-prerequisites",
  category: "dependencies",
  check: (): CheckResult => {
    const uvxVersion = checkUvxVersion()
    if (!uvxVersion) return { name: "mcp-prerequisites", status: "fail", message: "uvx (uv) not found — required for document_reader MCP", detail: "→ fix: Install uv/uvx: curl -LsSf https://astral.sh/uv/install.sh | sh\nThen warm cache: uvx --from markitdown-mcp markitdown-mcp --help" }
    try {
      const warm = Bun.spawnSync(["uvx", "--from", "markitdown-mcp", "markitdown-mcp", "--help"], { stdout: "pipe", stderr: "pipe", timeout: 30000 })
      const output = `${warm.stdout.toString()}${warm.stderr.toString()}`
      if (warm.exitCode === 0 || output.toLowerCase().includes("markitdown")) return { name: "mcp-prerequisites", status: "pass", message: `uvx ${uvxVersion} found; markitdown-mcp cache warm`, detail: output.trim().slice(0, 500) || undefined }
      return { name: "mcp-prerequisites", status: "warn", message: `uvx ${uvxVersion} found but markitdown-mcp could not resolve`, detail: `${output.trim().slice(0, 500)}\n→ fix: uvx --from markitdown-mcp markitdown-mcp --help` }
    } catch { void 0; return { name: "mcp-prerequisites", status: "warn", message: `uvx ${uvxVersion} found but warm-up timed out`, detail: "→ fix: Retry later: uvx --from markitdown-mcp markitdown-mcp --help" } }
  },
}
