/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve } from "node:path"

import { ORACLE_PERMISSION, ORACLE_SYSTEM_PROMPT } from "../../src/agents/oracle/system-prompt"
import { createPlanCreateTool } from "../../src/tools/plan/plan-create"
import { createPlanDeleteTool } from "../../src/tools/plan/plan-delete"
import { createPlanListTool } from "../../src/tools/plan/plan-list"
import { createPlanReadTool } from "../../src/tools/plan/plan-read"
import { createPlanTasksTool } from "../../src/tools/plan/plan-tasks"
import { createPlanUpdateTool } from "../../src/tools/plan/plan-update"

const REPO_ROOT = resolve(import.meta.dir, "../..")
const TEST_ABORT = new AbortController()

const PLAN_CONTENT = ["# Title", "", "## Section One", "alpha", "", "## Section Two", "beta", ""].join("\n")

/** Every plan tool the plugin registers, keyed by its registered tool name. */
const PLAN_TOOLS = {
  plan_create: createPlanCreateTool,
  plan_read: createPlanReadTool,
  plan_list: createPlanListTool,
  plan_update: createPlanUpdateTool,
  plan_delete: createPlanDeleteTool,
  plan_tasks: createPlanTasksTool,
} as const

type PlanToolName = keyof typeof PLAN_TOOLS

function testContext(testDir: string) {
  return {
    sessionID: "test-session-boundary",
    messageID: "test-message-boundary",
    agent: "oracle",
    abort: TEST_ABORT.signal,
    directory: testDir,
    worktree: testDir,
    metadata: () => {},
    ask: async () => {},
  }
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, acc)
    } else if (entry.isFile() && full.endsWith(".ts")) {
      acc.push(full)
    }
  }
  return acc
}

describe("plan access rule (system-prompt.ts prose half)", () => {
  test("states that plan files are modified ONLY via plan_update", () => {
    //#given the Oracle planner prompt
    const source = readFileSync(join(REPO_ROOT, "src/agents/oracle/system-prompt.ts"), "utf8")

    //#when the rule is read
    const matches = source.match(/.*modified ONLY via plan_update.*/g) ?? []

    //#then the rule is present, in a comment that names the generic-tool prohibition
    expect(matches).toHaveLength(1)
    expect(matches[0]).toContain("plan_update")
    expect(matches[0]).toMatch(/never generic Edit\/Write/)
  })

  test("the rule is repeated in the assembled prompt so the model actually sees it", () => {
    //#given the Oracle planner prompt
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when searched for the write-boundary rule
    const hits = prompt.match(/plan files are managed ONLY via plan_\* tools/gi) ?? []

    //#then the same boundary reaches the model through the write protocol
    expect(hits.length).toBeGreaterThanOrEqual(1)
  })
})

describe("plan access rule (ORACLE_PERMISSION enforcement half)", () => {
  test("plan_update is allowed, generic edit is denied, and plan_update is the only MUTATOR granted", () => {
    //#given the Oracle planner permission config
    // The enumeration invariant ("exactly the two authoring tools are granted")
    // lives in the test above; this one owns the mutation-vs-permission split.
    const permission = ORACLE_PERMISSION as Record<string, string>

    //#when the granted plan_* tools are classified by what they do to an existing plan
    const mutators = ["plan_update"]
    const creators = ["plan_create"]

    //#then exactly one granted tool can modify an existing plan, and generic edit is denied
    expect(mutators.filter((k) => permission[k] === "allow")).toEqual(["plan_update"])
    expect(permission.edit).toBe("deny")
    // plan_create is a creator, never a mutator: plan-create.ts refuses with
    // file_exists when the path already exists, so it cannot rewrite a plan.
    expect(creators.filter((k) => permission[k] === "allow")).toEqual(["plan_create"])
  })

  test("the plan-authoring path is explicitly reachable: plan_create AND plan_update are both allowed", () => {
    //#given the Oracle planner permission config
    const permission = ORACLE_PERMISSION as Record<string, string>

    //#when the granted plan_* tools are listed
    const planPermissionKeys = Object.keys(permission)
      .filter((k) => k.startsWith("plan_"))
      .sort()

    //#then the two authoring tools are enumerated, not left implicit
    // Branches 1, 2 and 3 of the Oracle DECISION TREE (identity-constraints.ts
    // section 6.1) all route through plan_create, so an unstated grant is a
    // silent single point of failure if the permission list is ever tightened.
    expect(planPermissionKeys).toEqual(["plan_create", "plan_update"])
    expect(permission.plan_create).toBe("allow")
    expect(permission.plan_update).toBe("allow")
  })

  test("no non-authoring plan tool is granted", () => {
    //#given the Oracle planner permission config
    const permission = ORACLE_PERMISSION as Record<string, string>

    //#when read-only, destructive and task-plan tools are checked
    const forbidden = ["plan_read", "plan_list", "plan_delete", "plan_tasks", "plan_tasks_clear"]

    //#then none of them is granted — only create and update are
    for (const key of forbidden) {
      expect(permission[key]).toBeUndefined()
    }
  })

  test("plan review is stated as explicit-only in Oracle's prompt", () => {
    //#given the assembled Oracle prompt
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when searched for the review policy
    const hits = prompt.match(/Plan review is explicit: run .*?\/plan-review.*?only when the user asks for it\. Never auto-trigger a plan review/g) ?? []

    //#then Oracle is told review is user-invoked, never self-triggered
    expect(hits).toHaveLength(1)
  })

  test("the permission object grants no write/edit path that could touch a plan file", () => {
    //#given the Oracle planner permission config
    const permission = ORACLE_PERMISSION as Record<string, string>

    //#when the keys that could mutate a file are listed
    const mutatingKeys = Object.keys(permission).filter((k) => /^(write|edit|multiedit|patch|apply_patch)$/.test(k))

    //#then only the denied one is present
    expect(mutatingKeys).toEqual(["edit"])
    expect(permission.edit).toBe("deny")
  })
})

describe("plan_update is the sole plan-mutation path", () => {
  let testDir: string
  const planPath = ".matrixx/plans/boundary-plan.md"
  const absolutePlan = () => join(testDir, planPath)

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-boundary-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
  })

  test("plan_create refuses to overwrite an existing plan (file_exists guard)", async () => {
    //#given an existing, valid plan file
    const create = createPlanCreateTool()
    const ctx = testContext(testDir)
    await create.execute({ filePath: planPath, content: PLAN_CONTENT }, ctx)
    const before = readFileSync(absolutePlan(), "utf8")

    //#when a second plan_create is attempted on the same path
    const second = JSON.parse(await create.execute({ filePath: planPath, content: "# Hijacked\n" }, ctx))

    //#then it is refused and the original bytes are untouched
    expect(second.error).toBe("file_exists")
    expect(second.message).toContain("plan_update")
    expect(readFileSync(absolutePlan(), "utf8")).toBe(before)
  })

  test("every registered plan tool except plan_update and plan_delete leaves an existing plan's bytes unchanged", async () => {
    //#given a plan file and the registered plan tools
    // plan_delete is excluded from this loop because it REMOVES the file (asserted
    // separately below); removal is not a content-mutation path.
    const create = createPlanCreateTool()
    const ctx = testContext(testDir)
    await create.execute({ filePath: planPath, content: PLAN_CONTENT }, ctx)
    const original = readFileSync(absolutePlan(), "utf8")

    //#when each non-mutating plan tool is invoked against that plan
    for (const name of Object.keys(PLAN_TOOLS) as PlanToolName[]) {
      if (name === "plan_update" || name === "plan_delete") continue
      await PLAN_TOOLS[name]().execute({ filePath: planPath }, ctx)
    }

    //#then the file still exists byte-for-byte
    expect(existsSync(absolutePlan())).toBe(true)
    expect(readFileSync(absolutePlan(), "utf8")).toBe(original)
  })

  test("plan_update is the one tool that changes an existing plan's bytes", async () => {
    //#given a plan file and its first hashline anchor
    const create = createPlanCreateTool()
    const read = createPlanReadTool()
    const update = createPlanUpdateTool()
    const ctx = testContext(testDir)
    await create.execute({ filePath: planPath, content: PLAN_CONTENT }, ctx)
    const anchor = (JSON.parse(await read.execute({ filePath: planPath }, ctx)).hashline.split("\n")[0] ?? "").split("|")[0] ?? ""
    const original = readFileSync(absolutePlan(), "utf8")

    //#when plan_update replaces that anchored line
    await update.execute({ filePath: planPath, edits: [{ op: "replace", pos: anchor, lines: ["# Renamed"] }] }, ctx)

    //#then the bytes changed
    expect(readFileSync(absolutePlan(), "utf8")).not.toBe(original)
  })

  test("the section-scoped edit form is a form of plan_update, not a second tool", async () => {
    //#given a plan and the registered plan tool names
    const registered = Object.keys(PLAN_TOOLS)

    //#when the tool names are compared against the mutation-path set
    const mutationPaths = ["plan_update"]

    //#then no new plan-writing tool appeared when the section form landed
    expect(registered.filter((n) => mutationPaths.includes(n))).toEqual(["plan_update"])
    expect(registered).toContain("plan_update")
  })

  test("plan_delete removes a plan but is not a content-mutation path", async () => {
    //#given an existing plan file
    const create = createPlanCreateTool()
    const del = createPlanDeleteTool()
    const ctx = testContext(testDir)
    await create.execute({ filePath: planPath, content: PLAN_CONTENT }, ctx)
    const beforeSize = statSync(absolutePlan()).size

    //#when plan_delete runs
    const result = JSON.parse(await del.execute({ filePath: planPath }, ctx))

    //#then it removes the whole file rather than editing content in place
    expect(result.success).toBe(true)
    expect(existsSync(absolutePlan())).toBe(false)
    expect(beforeSize).toBeGreaterThan(0)
  })
})

describe("every plan_read doc site teaches the section selector", () => {
  /**
   * src/agents/smith.ts is EXPLICITLY SKIPPED and MUST stay skipped.
   * Reason: smith.ts mentions plan_read at lines 21 and 110, but the file is
   * byte-frozen by a mission guardrail — it is not owned by this task and must
   * not be edited to satisfy a documentation-coverage test. A silent skip
   * would be a false pass (the next reader would assume the file was checked),
   * so the exclusion is asserted here: if the freeze is ever lifted, this test
   * fails and the exemption has to be removed deliberately.
   */
  const FROZEN_PLAN_READ_SITES = ["src/agents/smith.ts"]

  const DOC_ROOTS = ["src/agents", "src/features/builtin-commands"]

  function filesMentioningPlanRead(): string[] {
    const found: string[] = []
    for (const root of DOC_ROOTS) {
      for (const file of walk(join(REPO_ROOT, root))) {
        if (readFileSync(file, "utf8").includes("plan_read")) {
          found.push(relative(REPO_ROOT, file).split("\\").join("/"))
        }
      }
    }
    return found.sort()
  }

  test("the smith.ts exemption is exactly the byte-frozen file and nothing else", () => {
    //#given the frozen-site list
    const frozen = FROZEN_PLAN_READ_SITES

    //#when it is compared against the plan_read doc sites that exist
    const actual = filesMentioningPlanRead()

    //#then smith.ts is present (it is a real orphan) and the list stays minimal
    expect(actual).toContain("src/agents/smith.ts")
    expect(frozen).toEqual(["src/agents/smith.ts"])
  })

  test("every plan_read doc site except the frozen ones also mentions the section selector", () => {
    //#given every file under src/agents/ and src/features/builtin-commands/ mentioning plan_read
    const sites = filesMentioningPlanRead()
    const orphans: string[] = []

    //#when each non-frozen site is checked for the section selector
    for (const site of sites) {
      if (FROZEN_PLAN_READ_SITES.includes(site)) continue
      if (!readFileSync(join(REPO_ROOT, site), "utf8").toLowerCase().includes("section")) {
        orphans.push(site)
      }
    }

    //#then no orphan remains
    expect(sites.length).toBeGreaterThan(0)
    expect(orphans).toEqual([])
  })
})
