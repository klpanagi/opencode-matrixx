import type { CheckResult, DoctorCheck } from "../types"

function checkUvxVersion(): string | null {
  try {
    const r = Bun.spawnSync(["uvx", "--version"], { stdout: "pipe", stderr: "pipe" })
    if (r.exitCode === 0) {
      return r.stdout.toString().trim().split("\n")[0]?.replace(/^uvx\s+/i, "") || null
    }
  } catch {
    // Not installed
  }
  return null
}

export const mcpPrerequisitesCheck: DoctorCheck = {
  name: "mcp-prerequisites",
  category: "dependencies",
  check: (): CheckResult => {
    const uvxVersion = checkUvxVersion()

    if (!uvxVersion) {
      return {
        name: "mcp-prerequisites",
        status: "fail",
        message: "uvx (uv) not found — required for the document_reader MCP",
        detail:
          "Install uv/uvx: curl -LsSf https://astral.sh/uv/install.sh | sh\n" +
          "Then run once to warm the markitdown-mcp cache:\n" +
          "  uvx --from markitdown-mcp markitdown-mcp --help",
      }
    }

    try {
      const warm = Bun.spawnSync(
        ["uvx", "--from", "markitdown-mcp", "markitdown-mcp", "--help"],
        { stdout: "pipe", stderr: "pipe", timeout: 120000 },
      )
      const output = `${warm.stdout.toString()}${warm.stderr.toString()}`
      if (warm.exitCode === 0 || output.includes("MarkItDown")) {
        return {
          name: "mcp-prerequisites",
          status: "pass",
          message: `uvx ${uvxVersion} found; markitdown-mcp cache warm`,
          detail: output.trim() || undefined,
        }
      }
      return {
        name: "mcp-prerequisites",
        status: "warn",
        message: `uvx ${uvxVersion} found but markitdown-mcp could not resolve`,
        detail: output.trim() || undefined,
      }
    } catch {
      return {
        name: "mcp-prerequisites",
        status: "warn",
        message: `uvx ${uvxVersion} found but warm-up timed out (network?)`,
        detail: "Retry later: uvx --from markitdown-mcp markitdown-mcp --help",
      }
    }
  },
}
