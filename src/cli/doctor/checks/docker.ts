import type { CheckResult, DoctorCheck } from "../types"

export const dockerCheck: DoctorCheck = {
  name: "docker-integration",
  category: "integrations",
  check: (): CheckResult => {
    let dockerVersion: string | null = null
    try {
      const r = Bun.spawnSync(["docker", "--version"], { stdout: "pipe", stderr: "pipe" })
      if (r.exitCode === 0) dockerVersion = r.stdout.toString().trim().split("\n")[0] ?? null
    } catch {}
    if (!dockerVersion) {
      const which = Bun.which("docker")
      if (!which) {
        return {
          name: "docker-integration",
          status: "pass",
          message: "docker not found (optional — enable docker-master skill if needed)",
        }
      }
      dockerVersion = which
    }
    let composeVersion: string | null = null
    try {
      const r = Bun.spawnSync(["docker", "compose", "version"], { stdout: "pipe", stderr: "pipe" })
      if (r.exitCode === 0) composeVersion = r.stdout.toString().trim().split("\n")[0] ?? null
      else {
        const r2 = Bun.spawnSync(["docker-compose", "--version"], { stdout: "pipe", stderr: "pipe" })
        if (r2.exitCode === 0) composeVersion = r2.stdout.toString().trim().split("\n")[0] ?? null
      }
    } catch {}
    let buildxVersion: string | null = null
    try {
      const r = Bun.spawnSync(["docker", "buildx", "version"], { stdout: "pipe", stderr: "pipe" })
      if (r.exitCode === 0) buildxVersion = r.stdout.toString().trim().split("\n")[0] ?? null
    } catch {}
    const parts = [dockerVersion]
    if (composeVersion) parts.push(composeVersion)
    if (buildxVersion) parts.push(buildxVersion)
    if (!composeVersion) {
      return {
        name: "docker-integration",
        status: "warn",
        message: `docker found: ${dockerVersion} but compose not found`,
        detail: "Install docker compose v2: docker compose version should succeed",
      }
    }
    return {
      name: "docker-integration",
      status: "pass",
      message: `docker available: ${parts.join(", ")}`,
    }
  },
}
