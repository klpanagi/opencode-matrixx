import type { CheckResult, DoctorCheck } from "../types"

interface RuntimeInfo {
  name: string
  version: string | null
  status: "pass" | "warn" | "fail"
}

function checkCommand(cmd: string, arg = "--version"): string | null {
  try {
    const result = Bun.spawnSync([cmd, arg], {
      stdout: "pipe",
      stderr: "pipe",
    })
    if (result.exitCode === 0) {
      return result.stdout.toString().trim().split("\n")[0] || null
    }
  } catch {
    // Not installed
  }
  return null
}

function getRuntimeVersions(): RuntimeInfo[] {
  const runtimes: RuntimeInfo[] = [
    { name: "Bun", version: checkCommand("bun"), status: "fail" },
    { name: "Node.js", version: checkCommand("node"), status: "fail" },
    { name: "Git", version: checkCommand("git"), status: "fail" },
    { name: "Python3", version: checkCommand("python3", "--version"), status: "fail" },
  ]

  for (const r of runtimes) {
    if (r.version) {
      r.status = "pass"
    }
  }

  return runtimes
}

export const runtimeDepsCheck: DoctorCheck = {
  name: "runtime-dependencies",
  category: "dependencies",
  check: (): CheckResult => {
    const runtimes = getRuntimeVersions()
    const passed = runtimes.filter((r) => r.status === "pass")
    const failed = runtimes.filter((r) => r.status === "fail")

    if (failed.length === 0) {
      return {
        name: "runtime-dependencies",
        status: "pass",
        message: `All runtimes found: ${passed.map((r) => `${r.name} ${r.version}`).join(", ")}`,
      }
    }

    const missingList = failed.map((r) => r.name).join(", ")
    const detailLines: string[] = []
    for (const r of runtimes) {
      const status = r.version ? `${r.version}` : "NOT FOUND"
      detailLines.push(`  ${r.name}: ${status}`)
    }

    if (failed.length <= passed.length) {
      return {
        name: "runtime-dependencies",
        status: "warn",
        message: `Found: ${passed.map((r) => r.name).join(", ")}. Missing: ${missingList}`,
        detail: detailLines.join("\n"),
      }
    }

    return {
      name: "runtime-dependencies",
      status: "fail",
      message: `Critical runtimes missing: ${missingList}`,
      detail: detailLines.join("\n"),
    }
  },
}
