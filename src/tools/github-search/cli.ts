import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runRg } from "../grep/cli"
import { CLONE_DEPTH, DEFAULT_TIMEOUT_MS, MAX_LIMIT, TMP_PREFIX } from "./constants"
import type { GithubSearchHit, GithubSearchResult } from "./types"

function findExecutable(name: string): string | null {
  const cmd = process.platform === "win32" ? "where" : "which"
  try {
    const result = spawnSync(cmd, [name], { encoding: "utf-8", timeout: 5000 })
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim().split("\n")[0]?.trim() ?? null
    }
  } catch {
    // not found
  }
  return null
}

interface ProcResult {
  stdout: string
  stderr: string
  exitCode: number
}

async function runCmd(cmd: string, args: string[], cwd: string, timeout: number): Promise<ProcResult> {
  const proc = spawn(cmd, args, { cwd, timeout })
  let stdout = ""
  let stderr = ""
  proc.stdout?.on("data", (d: Buffer) => {
    stdout += d.toString()
  })
  proc.stderr?.on("data", (d: Buffer) => {
    stderr += d.toString()
  })
  const exitCode: number = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        // already exited
      }
      resolve(124)
    }, timeout)
    proc.on("close", (code: number | null) => {
      clearTimeout(timer)
      resolve(code ?? 0)
    })
    proc.on("error", () => {
      clearTimeout(timer)
      resolve(127)
    })
  })
  return { stdout, stderr, exitCode }
}

function sanitizeRepo(repo: string): string {
  return repo.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 80)
}

interface GhCodeItem {
  repository?: { nameWithOwner?: string }
  path?: string
  sha?: string
  url?: string
}

function parseGhSearchOutput(stdout: string, fallbackRepo: string): GithubSearchHit[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    const items: GhCodeItem[] = Array.isArray(parsed) ? (parsed as GhCodeItem[]) : []
    return items.map((item) => ({
      repo: item.repository?.nameWithOwner ?? fallbackRepo,
      path: item.path ?? "",
      sha: item.sha,
      url: item.url,
    }))
  } catch {
    return []
  }
}

async function codeSearch(query: string, repo: string | undefined, language: string | undefined, limit: number): Promise<GithubSearchResult> {
  const gh = findExecutable("gh")
  if (!gh) {
    return {
      hits: [],
      truncated: false,
      mode: "code-search",
      error: "gh CLI not found in PATH. Install from https://cli.github.com and authenticate with `gh auth login`.",
    }
  }
  const parts: string[] = [query]
  if (language) parts.push(`language:${language}`)
  if (repo) parts.push(`repo:${repo}`)
  const searchQuery = parts.join(" ")
  const capped = Math.min(Math.max(limit, 1), MAX_LIMIT)
  const args = ["search", "code", searchQuery, "--limit", String(capped), "--json", "repository,path,sha,url"]
  const { stdout, stderr, exitCode } = await runCmd(gh, args, process.cwd(), DEFAULT_TIMEOUT_MS)
  if (exitCode !== 0) {
    const hint = /auth|login|token/i.test(stderr) ? " Run `gh auth login` and retry." : ""
    return {
      hits: [],
      truncated: false,
      mode: "code-search",
      error: `gh search code failed: ${stderr.trim() || `exit ${exitCode}`}.${hint}`,
    }
  }
  const hits = parseGhSearchOutput(stdout, repo ?? "").slice(0, capped)
  return { hits, truncated: false, mode: "code-search" }
}

async function cloneAndSearch(query: string, repo: string): Promise<GithubSearchResult> {
  const gh = findExecutable("gh")
  const git = findExecutable("git")
  const cloneBin = gh ?? git
  if (!cloneBin) {
    return {
      hits: [],
      truncated: false,
      mode: "clone-search",
      error: "Neither gh nor git found in PATH. Install GitHub CLI (https://cli.github.com) or git.",
    }
  }
  const dest = join(tmpdir(), `${TMP_PREFIX}${sanitizeRepo(repo)}`)
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true })
    const cloneArgs = gh
      ? ["repo", "clone", repo, dest, "--", "--depth", String(CLONE_DEPTH)]
      : ["clone", "--depth", String(CLONE_DEPTH), `https://github.com/${repo}.git`, dest]
    const cloned = await runCmd(cloneBin, cloneArgs, process.cwd(), DEFAULT_TIMEOUT_MS)
    if (cloned.exitCode !== 0) {
      return {
        hits: [],
        truncated: false,
        mode: "clone-search",
        error: `Clone failed for ${repo}: ${cloned.stderr.trim() || `exit ${cloned.exitCode}`}`,
      }
    }
  }
  const shaRes = await runCmd("git", ["rev-parse", "HEAD"], dest, 15000)
  const sha = shaRes.exitCode === 0 ? shaRes.stdout.trim() : undefined
  const rgResult = await runRg({ pattern: query, paths: [dest], context: 0 })
  if (rgResult.error) {
    return { hits: [], truncated: false, mode: "clone-search", error: rgResult.error }
  }
  const hits: GithubSearchHit[] = rgResult.matches.map((m) => {
    const rel = m.file.startsWith(dest) ? m.file.slice(dest.length + 1) : m.file
    return {
      repo,
      path: rel,
      sha,
      line: m.line,
      text: m.text,
      url: sha ? `https://github.com/${repo}/blob/${sha}/${rel}#L${m.line}` : undefined,
    }
  })
  return { hits, truncated: rgResult.truncated, mode: "clone-search" }
}

export async function githubSearch(opts: { query: string; repo?: string; language?: string; limit?: number }): Promise<GithubSearchResult> {
  const query = opts.query.trim()
  if (!query) {
    return { hits: [], truncated: false, mode: "code-search", error: "query must not be empty" }
  }
  if (opts.repo) {
    return cloneAndSearch(query, opts.repo.trim())
  }
  return codeSearch(query, undefined, opts.language?.trim() || undefined, opts.limit ?? 10)
}
