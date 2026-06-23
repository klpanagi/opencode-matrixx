import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import { OPENCODE_BINARIES } from "../constants"

const WINDOWS_EXECUTABLE_EXTS = [".exe", ".cmd", ".bat", ".ps1"]

interface OpenCodeBinaryInfo {
  binary: string
  path: string
}

function getDesktopAppPaths(platform: NodeJS.Platform): string[] {
  const home = homedir()

  switch (platform) {
    case "darwin":
      return [
        "/Applications/OpenCode.app/Contents/MacOS/OpenCode",
        join(home, "Applications", "OpenCode.app", "Contents", "MacOS", "OpenCode"),
      ]
    case "win32": {
      const programFiles = process.env.ProgramFiles
      const localAppData = process.env.LOCALAPPDATA
      const paths: string[] = []

      if (programFiles) {
        paths.push(join(programFiles, "OpenCode", "OpenCode.exe"))
      }
      if (localAppData) {
        paths.push(join(localAppData, "OpenCode", "OpenCode.exe"))
      }

      return paths
    }
    case "linux":
      return [
        "/usr/bin/opencode",
        "/usr/lib/opencode/opencode",
        join(home, "Applications", "opencode-desktop-linux-x86_64.AppImage"),
        join(home, "Applications", "opencode-desktop-linux-aarch64.AppImage"),
      ]
    default:
      return []
  }
}

function buildVersionCommand(binaryPath: string, platform: NodeJS.Platform): string[] {
  if (platform === "win32" && binaryPath.toLowerCase().endsWith(".ps1")) {
    return ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", binaryPath, "--version"]
  }

  return [binaryPath, "--version"]
}

function findDesktopBinary(
  platform: NodeJS.Platform = process.platform,
  checkExists: (path: string) => boolean = existsSync
): OpenCodeBinaryInfo | null {
  for (const desktopPath of getDesktopAppPaths(platform)) {
    if (checkExists(desktopPath)) {
      return { binary: "opencode", path: desktopPath }
    }
  }

  return null
}

export async function findOpenCodeBinary(): Promise<OpenCodeBinaryInfo | null> {
  for (const binary of OPENCODE_BINARIES) {
    const path = Bun.which(binary)
    if (path) {
      return { binary, path }
    }
  }

  return findDesktopBinary()
}

export async function getOpenCodeVersion(
  binaryPath: string,
  platform: NodeJS.Platform = process.platform
): Promise<string | null> {
  try {
    const command = buildVersionCommand(binaryPath, platform)
    const processResult = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" })
    const output = await new Response(processResult.stdout).text()
    await processResult.exited

    if (processResult.exitCode !== 0) return null
    return output.trim() || null
  } catch {
    return null
  }
}

export function compareVersions(current: string, minimum: string): boolean {
  const parseVersion = (version: string): number[] =>
    version
      .replace(/^v/, "")
      .split("-")[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0)

  const currentParts = parseVersion(current)
  const minimumParts = parseVersion(minimum)
  const length = Math.max(currentParts.length, minimumParts.length)

  for (let index = 0; index < length; index++) {
    const currentPart = currentParts[index] ?? 0
    const minimumPart = minimumParts[index] ?? 0
    if (currentPart > minimumPart) return true
    if (currentPart < minimumPart) return false
  }

  return true
}
