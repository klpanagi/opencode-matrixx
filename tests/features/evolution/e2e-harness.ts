/// <reference types="bun-types" />
// T10b E2E harness: scratch-project fixtures plus the MECHANIZED next-session
// skill-load check (enumerate `.opencode/skills/*/SKILL.md` + parse frontmatter).
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { load } from "js-yaml"
import type { EvolutionConfig } from "../../../src/config/schema/evolution"
import type { TraceRecord } from "../../../src/features/evolution/types"

export const PENDING_DIR = path.join(".matrixx", "evolution", "pending")
export const TRACES_DIR = path.join(".matrixx", "evolution", "traces")

/** A throwaway project root under the OS temp dir — never inside the repo. */
export function makeProject(prefix = "evo-e2e-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/** Baseline evolution config: approval required, no auto-promote, minConfidence 0.7. */
export function e2eConfig(): EvolutionConfig {
  return {
    enabled: true,
    watcher: { maxArgChars: 4000, maxOutputChars: 8000, skipTools: ["evolution-watcher", "evolution-compressor"] },
    compressor: { provider: "llm", minTraces: 5, maxInputTokens: 32000, trigger: "both" },
    writer: { outputDir: ".matrixx/evolution/skills", globalSkills: false, allowToolGeneration: false, allowAgentGeneration: false },
    governance: { requireApproval: true, autoPromote: false, autoPromoteThreshold: 0.85, minConfidence: 0.7 },
    retention: { traceDays: 30, maxPending: 50 },
    budget: { maxCompressionsPerHour: 10, maxCostCentsPerDay: 100 },
  }
}

export function makeTrace(id: string, sessionID: string, success = true): TraceRecord {
  return {
    id,
    sessionID,
    callID: `call-${id}`,
    timestamp: new Date().toISOString(),
    agent: "e2e-agent",
    tool: "read",
    args: {},
    output: success ? `ok ${id}` : `fail ${id}`,
    durationMs: 5,
    success,
    ...(success ? {} : { errorType: "tool-error" }),
  }
}

/** Read a staged proposal's meta.json (relative to the current project cwd). */
export function readPendingMeta(slug: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(PENDING_DIR, `${slug}.meta.json`), "utf-8")
  return JSON.parse(raw) as Record<string, unknown>
}

/** Trace ids actually persisted on disk for a session file. */
export function readTraceIds(sessionID: string): string[] {
  const file = path.join(TRACES_DIR, `${sessionID}.jsonl`)
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => (JSON.parse(line) as TraceRecord).id)
}

export function extractFrontmatter(content: string): string {
  const start = content.indexOf("---\n")
  const end = content.indexOf("\n---", start + 4)
  return content.slice(start + 4, end)
}

export type LoadedSkill = { slug: string; skillPath: string; frontmatter: Record<string, unknown> }

/**
 * MECHANIZED next-session load check: enumerate every `.opencode/skills/<slug>/SKILL.md`,
 * parse its YAML frontmatter, and return them. A missing skills dir yields no entries.
 */
export function enumerateLoadableSkills(projectRoot: string): LoadedSkill[] {
  const base = path.join(projectRoot, ".opencode", "skills")
  if (!fs.existsSync(base)) return []
  const out: LoadedSkill[] = []
  for (const entry of fs.readdirSync(base)) {
    const skillPath = path.join(base, entry, "SKILL.md")
    if (!fs.existsSync(skillPath)) continue
    const frontmatter = load(extractFrontmatter(fs.readFileSync(skillPath, "utf-8"))) as Record<string, unknown>
    out.push({ slug: entry, skillPath, frontmatter })
  }
  return out
}
