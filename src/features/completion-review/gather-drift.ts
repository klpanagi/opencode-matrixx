/**
 * Task 2 — deliverable drift (rubric dimension 5) via read-only git.
 *
 * `git` is reached through an INJECTED runner, never a hard-coded
 * `execSync`: the gatherer must stay a pure function of its sources, and a test
 * must be able to exercise drift without touching VCS at all.
 */
import { execFileSync } from "node:child_process"
import { parseMetadataComment } from "../mission-state/plan-storage"
import type { ChangedFile, DriftFacts, GitRunner } from "./gather-types"

export const NO_START_COMMIT_REASON = "plan records no start commit"

/** Default runner. Read-only commands only; nothing here mutates the worktree. */
export const defaultGitRunner: GitRunner = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] })
  } catch {
    return ""
  }
}

/**
 * The plan's recorded start commit, from the `plan-persister` metadata comment
 * written by `upsertMetadataComment`. Read through the shipped parser so the
 * tag format has one owner.
 */
export function readStartCommit(content: string): string | null {
  return parseMetadataComment(content)?.gitHead?.sha ?? null
}

function parseNameStatus(raw: string): ChangedFile[] {
  const files: ChangedFile[] = []
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "") continue
    const [status, ...rest] = trimmed.split("\t")
    if (status === undefined || rest.length === 0) continue
    files.push({ status, path: rest.join("\t") })
  }
  return files
}

function runQuietly(runGit: GitRunner, args: string[]): string | null {
  const raw = runGit(args)
  return raw.trim() === "" ? null : raw
}

/**
 * Diff the plan's start commit against the worktree. When the plan records no
 * start commit the result is EXPLICITLY unscorable — not an empty diff, which
 * would read as "no drift" and silently pass dimension 5.
 */
export function gatherDrift(
  content: string,
  directory: string,
  runGit: GitRunner,
  startCommitOverride?: string,
): DriftFacts {
  const startCommit = startCommitOverride ?? readStartCommit(content)
  if (startCommit === null) {
    return {
      startCommit: null,
      stat: null,
      nameStatus: [],
      unscorable: true,
      unscorableReason: NO_START_COMMIT_REASON,
    }
  }
  return {
    startCommit,
    stat: runQuietly(runGit, ["-C", directory, "diff", "--stat", startCommit, "--"]),
    nameStatus: parseNameStatus(runGit(["-C", directory, "diff", "--name-status", startCommit, "--"])),
    unscorable: false,
    unscorableReason: null,
  }
}
