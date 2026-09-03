import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { CheckResult, DoctorCheck } from "../types"

type OptionalTool = { name: string; check: () => { available: boolean; version?: string } }

function spawnVersion(cmd: string, args: string[]): { available: boolean; version?: string } {
  try {
    const r = Bun.spawnSync([cmd, ...args], { stdout: "pipe", stderr: "pipe" })
    return { available: r.exitCode === 0, version: r.stdout.toString().trim().split("\n")[0]?.trim() || undefined }
  } catch { void 0; return { available: false } }
}

function cachedCommentChecker(): { available: boolean; version?: string } {
  try {
    const cacheDir = process.env.XDG_CACHE_HOME ? join(process.env.XDG_CACHE_HOME, "matrixx", "bin") : join(homedir(), ".cache", "matrixx", "bin")
    const bin = process.platform === "win32" ? "comment-checker.exe" : "comment-checker"
    const p = join(cacheDir, bin)
    if (existsSync(p)) {
      const r = Bun.spawnSync([p, "--version"], { stdout: "pipe", stderr: "pipe" })
      if (r.exitCode === 0) return { available: true, version: r.stdout.toString().trim().split("\n")[0]?.trim() }
      return { available: true }
    }
  } catch { void 0 }
  return { available: false }
}

const BINARY_CHECKS: OptionalTool[] = [
  { name: "ast-grep (sg)", check: () => spawnVersion("sg", ["--version"]) },
  { name: "Gitleaks", check: () => spawnVersion("gitleaks", ["--version"]) },
  { name: "comment-checker", check: cachedCommentChecker },
  { name: "gh CLI", check: () => spawnVersion("gh", ["--version"]) },
  { name: "Docker", check: () => spawnVersion("docker", ["--version"]) },
]

const PYTHON_CHECKS: OptionalTool[] = [
  { name: "PyMuPDF (fitz)", check: () => spawnVersion("python3", ["-c", "import fitz; print(fitz.__version__)"]) },
  { name: "Playwright (CLI)", check: () => spawnVersion("playwright", ["--version"]) },
]

export const optionalToolsCheck: DoctorCheck = {
  name: "optional-tools",
  category: "tools",
  check: (): CheckResult => {
    const binaryResults = BINARY_CHECKS.map((t) => {
      const r = t.check()
      return { name: t.name, ...r }
    })
    let pythonResults: Array<{ name: string; available: boolean; version?: string }> = []
    try {
      const pyCheck = Bun.spawnSync(["python3", "--version"], { stdout: "pipe", stderr: "pipe" })
      if (pyCheck.exitCode === 0) pythonResults = PYTHON_CHECKS.map((t) => ({ name: t.name, ...t.check() }))
      else pythonResults = PYTHON_CHECKS.map((t) => ({ name: t.name, available: false, version: undefined }))
    } catch { void 0; pythonResults = PYTHON_CHECKS.map((t) => ({ name: t.name, available: false, version: undefined })) }
    const allResults = [...binaryResults, ...pythonResults]
    const available = allResults.filter((r) => r.available)
    const missing = allResults.filter((r) => !r.available)
    if (missing.length === 0) return { name: "optional-tools", status: "pass", message: `All optional tools available: ${available.map((r) => r.name).join(", ")}` }
    const detailLines = allResults.map((r) => (r.available ? `  ✓ ${r.name}${r.version ? ` (${r.version})` : ""}` : `  ✗ ${r.name} — not installed → fix: install ${r.name.split(" ")[0]}`))
    const missingList = missing.map((r) => r.name).join(", ")
    return { name: "optional-tools", status: "warn", message: `Available: ${available.length}, Missing: ${missing.length} (${missingList})`, detail: detailLines.join("\n") }
  },
}
