/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createTaskNotepadWriterHook,
  type TaskNotepadWriterContext,
} from "../../../src/hooks/task-notepad-writer/index"

/**
 * Hand-rolled harness. The hook is re-keyed from the deleted `task-notepad` hook:
 * it no longer reads `session.todo()` (that data source is gone) and instead reads
 * the file-backed task store under `<project>/.matrixx/tasks`.
 *
 * Every fixture root is a `mkdtemp` under `os.tmpdir()`, so the repo's real
 * notepad directory is never a read or write target.
 */

interface TaskFixture {
  id: string
  subject: string
  description?: string
  status: "pending" | "in_progress" | "completed" | "deleted"
  priority?: "low" | "medium" | "high"
  metadata?: Record<string, unknown>
  deduplicated?: boolean
}

interface ToolAfterInput {
  tool: string
  sessionID: string
  callID: string
}

interface ToolOutput {
  title: string
  output: string
  metadata: Record<string, unknown>
}

interface TaskNotepadWriterHook {
  "tool.execute.after": (input: ToolAfterInput, output: ToolOutput | undefined) => Promise<void>
}

type HookContext = Pick<TaskNotepadWriterContext, "directory" | "config">

const ADHOC_BUCKET = "adhoc"

let tempDir: string
let tasksDir: string
let plansDir: string
let notepadsRoot: string

function makeContext(): HookContext {
  return { directory: tempDir, config: {} }
}

function makeHook(): TaskNotepadWriterHook {
  return createTaskNotepadWriterHook(makeContext() as unknown as TaskNotepadWriterContext)
}

function seedTask(fixture: TaskFixture): void {
  mkdirSync(tasksDir, { recursive: true })
  const stored = {
    id: fixture.id,
    subject: fixture.subject,
    description: fixture.description ?? "",
    status: fixture.status,
    blocks: [],
    blockedBy: [],
    metadata: fixture.metadata,
    threadID: "ses_test",
    priority: fixture.priority,
  }
  writeFileSync(join(tasksDir, `${fixture.id}.json`), JSON.stringify(stored, null, 2), "utf-8")
}

function writePlan(name: string): void {
  mkdirSync(plansDir, { recursive: true })
  writeFileSync(join(plansDir, `${name}.md`), `# Plan: ${name}\n`, "utf-8")
}

function createOutput(fixture: TaskFixture): ToolOutput {
  const summary = {
    id: fixture.id,
    subject: fixture.subject,
    ...(fixture.deduplicated ? { deduplicated: true } : {}),
  }
  return { title: "task_create", output: JSON.stringify({ tasks: [summary], errors: [] }), metadata: {} }
}

function updateOutput(fixture: TaskFixture): ToolOutput {
  return {
    title: "task_update",
    output: JSON.stringify({
      task: { id: fixture.id, subject: fixture.subject, status: fixture.status },
    }),
    metadata: {},
  }
}

function bucketDir(bucket: string): string {
  return join(notepadsRoot, bucket)
}

function listBucket(bucket: string): string[] {
  const dir = bucketDir(bucket)
  if (!existsSync(dir)) return []
  return readdirSync(dir).sort()
}

function onlyFile(bucket: string): string {
  const files = listBucket(bucket)
  expect(files).toHaveLength(1)
  return files[0] as string
}

function readBucketFile(bucket: string, name: string): string {
  return readFileSync(join(bucketDir(bucket), name), "utf-8")
}

function fire(tool: string, output: ToolOutput | undefined): Promise<void> {
  return makeHook()["tool.execute.after"](
    { tool, sessionID: "ses_test", callID: "call_test" },
    output,
  )
}

function planFixture(overrides: Partial<TaskFixture> = {}): TaskFixture {
  return {
    id: "T-11111111-2222-3333-4444-555555555555",
    subject: "Demo task",
    status: "pending",
    priority: "high",
    metadata: { planName: "demo-plan" },
    ...overrides,
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "tnw-"))
  tasksDir = join(tempDir, ".matrixx", "tasks")
  plansDir = join(tempDir, ".matrixx", "plans")
  notepadsRoot = join(tempDir, ".matrixx", "notepads")
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe("case 1: task_create scaffolds a plan-bucket file", () => {
  test("writes 0-demo-task.md into the demo-plan bucket with the full scaffold", async () => {
    //#given: a plan file exists and a seeded task carries metadata.planName
    writePlan("demo-plan")
    const fixture = planFixture()
    seedTask(fixture)

    //#when: task_create fires through tool.execute.after
    await fire("task_create", createOutput(fixture))

    //#then: a flat numbered file exists in the plan bucket with the scaffold header and sections
    expect(listBucket("demo-plan")).toHaveLength(1)
    const name = onlyFile("demo-plan")
    expect(name).toBe("0-demo-task.md")
    const content = readBucketFile("demo-plan", name)
    expect(content).toContain("# Task: Demo task")
    expect(content).toContain(`**Task ID**: ${fixture.id}`)
    expect(content).toContain("**Priority**: high")
    expect(content).toContain("**Status**: pending")
    expect(content).toMatch(/\*\*Started\*\*: \d{4}-\d{2}-\d{2}T[\d:.]+Z/)
    expect(content).toContain("## Findings")
    expect(content).toContain("## Blockers")
    expect(content).toContain("## Questions")
    expect(content).toContain("## Results")
  })
})

describe("case 2: no planName routes the scaffold to the adhoc bucket", () => {
  test("writes the file under adhoc instead of a plan bucket", async () => {
    //#given: a plan file exists but the task has no metadata.planName
    writePlan("demo-plan")
    const fixture = planFixture({ id: "T-11111111-2222-3333-4444-666666666666", metadata: {} })
    seedTask(fixture)

    //#when: task_create fires
    await fire("task_create", createOutput(fixture))

    //#then: the file lands in adhoc and no plan bucket is created
    expect(listBucket(ADHOC_BUCKET)).toHaveLength(1)
    expect(existsSync(bucketDir("demo-plan"))).toBe(false)
  })
})

describe("case 3: planName set but the plan file is missing never misfiles", () => {
  test("falls back to adhoc and writes nothing under the plan bucket", async () => {
    //#given: metadata.planName is set but no corresponding plan file was ever created
    const fixture = planFixture({ id: "T-11111111-2222-3333-4444-777777777777" })
    seedTask(fixture)

    //#when: task_create fires
    await fire("task_create", createOutput(fixture))

    //#then: the file is in adhoc and no demo-plan bucket exists at all
    expect(listBucket(ADHOC_BUCKET)).toHaveLength(1)
    expect(existsSync(bucketDir("demo-plan"))).toBe(false)
  })
})

describe("case 4: filename is a kebab slug with an integer (not zero-padded) prefix", () => {
  test("produces 0-fix-the-flaky-test.md for a punctuated subject", async () => {
    //#given: a task subject with capitals, spaces and trailing punctuation
    writePlan("demo-plan")
    const fixture = planFixture({
      id: "T-11111111-2222-3333-4444-888888888888",
      subject: "Fix the Flaky Test!!",
    })
    seedTask(fixture)

    //#when: task_create fires
    await fire("task_create", createOutput(fixture))

    //#then: the filename matches the expected shape and the prefix is not zero-padded
    const name = onlyFile("demo-plan")
    expect(name).toMatch(/^[0-9]+-fix-the-flaky-test\.md$/)
    expect(name.startsWith("0")).toBe(true)
    expect(name).not.toMatch(/^0[0-9]/)
  })
})

describe("case 5: numbering increments within a bucket", () => {
  test("two creates produce 0-*.md then 1-*.md", async () => {
    //#given: a plan bucket and two distinct tasks to create
    writePlan("demo-plan")
    const first = planFixture({ id: "T-11111111-2222-3333-4444-aaaaaaaaaaaaa", subject: "First task" })
    const second = planFixture({ id: "T-11111111-2222-3333-4444-bbbbbbbbbbbb", subject: "Second task" })
    seedTask(first)
    seedTask(second)

    //#when: task_create fires twice
    await fire("task_create", createOutput(first))
    await fire("task_create", createOutput(second))

    //#then: the second file takes index 1
    expect(listBucket("demo-plan")).toEqual(["0-first-task.md", "1-second-task.md"])
  })
})

describe("case 6: deduplicated results are skipped without consuming an index", () => {
  test("no file is written and the next real create still gets index 0", async () => {
    //#given: a plan bucket, a deduplicated create for an unseeded task, then a real create
    writePlan("demo-plan")
    const dupe = planFixture({
      id: "T-11111111-2222-3333-4444-cccccccccccc",
      subject: "Dupe task",
      deduplicated: true,
    })
    const real = planFixture({ id: "T-11111111-2222-3333-4444-dddddddddddd", subject: "Real task" })
    seedTask(real)

    //#when: the deduplicated call fires, then the real call fires
    await fire("task_create", createOutput(dupe))
    await fire("task_create", createOutput(real))

    //#then: exactly one file exists, numbered 0
    expect(listBucket("demo-plan")).toEqual(["0-real-task.md"])
  })
})

describe("case 7: scaffolding is idempotent across fresh hook instances", () => {
  test("a second create through a new hook instance still yields one file", async () => {
    //#given: a plan bucket, a seeded task, and one create already performed
    writePlan("demo-plan")
    const fixture = planFixture({ id: "T-11111111-2222-3333-4444-eeeeeeeeeeee" })
    seedTask(fixture)
    await fire("task_create", createOutput(fixture))
    const afterFirst = readBucketFile("demo-plan", onlyFile("demo-plan"))

    //#when: the same create fires again through a brand-new hook instance
    await makeHook()["tool.execute.after"](
      { tool: "task_create", sessionID: "ses_test", callID: "call_test" },
      createOutput(fixture),
    )

    //#then: no second file, and the existing content is untouched
    expect(listBucket("demo-plan")).toHaveLength(1)
    expect(readBucketFile("demo-plan", onlyFile("demo-plan"))).toBe(afterFirst)
  })
})

describe("case 8: task_update to completed appends a Completion stamp", () => {
  test("adds ## Completion with completed_at and status lines", async () => {
    //#given: a task already scaffolded by a prior create
    writePlan("demo-plan")
    const fixture = planFixture({ id: "T-11111111-2222-3333-4444-ffffffffffff" })
    seedTask(fixture)
    await fire("task_create", createOutput(fixture))
    const before = readBucketFile("demo-plan", onlyFile("demo-plan"))
    seedTask({ ...fixture, status: "completed" })

    //#when: task_update sets the task to completed
    await fire("task_update", updateOutput({ ...fixture, status: "completed" }))

    //#then: the stamp is appended after the original scaffold
    const after = readBucketFile("demo-plan", onlyFile("demo-plan"))
    expect(after.startsWith(before)).toBe(true)
    expect(after).toContain("## Completion")
    expect(after).toMatch(/- completed_at: \d{4}-\d{2}-\d{2}T[\d:.]+Z/)
    expect(after).toContain("- status: completed")
  })
})

describe("case 9: the completion stamp never double-appends", () => {
  test("two completed updates across two hook instances leave one stamp", async () => {
    //#given: a scaffolded task already stamped once, via a fresh hook instance
    writePlan("demo-plan")
    const fixture = planFixture({ id: "T-11111111-2222-3333-4444-999999999999" })
    seedTask(fixture)
    await fire("task_create", createOutput(fixture))
    seedTask({ ...fixture, status: "completed" })
    await makeHook()["tool.execute.after"](
      { tool: "task_update", sessionID: "ses_test", callID: "call_test" },
      updateOutput({ ...fixture, status: "completed" }),
    )

    //#when: a second completed update fires through another fresh hook instance
    await makeHook()["tool.execute.after"](
      { tool: "task_update", sessionID: "ses_test", callID: "call_test" },
      updateOutput({ ...fixture, status: "completed" }),
    )

    //#then: exactly one Completion section remains
    const after = readBucketFile("demo-plan", onlyFile("demo-plan"))
    expect(after.match(/## Completion/g)).toHaveLength(1)
    expect(after.match(/- status: completed/g)).toHaveLength(1)
  })
})

describe("case 10: a non-completed task_update writes nothing", () => {
  test("an in_progress update leaves the scaffold byte-identical", async () => {
    //#given: a scaffolded, unstamped task
    writePlan("demo-plan")
    const fixture = planFixture({ id: "T-11111111-2222-3333-4444-121212121212" })
    seedTask(fixture)
    await fire("task_create", createOutput(fixture))
    const before = readBucketFile("demo-plan", onlyFile("demo-plan"))
    seedTask({ ...fixture, status: "in_progress" })

    //#when: task_update sets the task to in_progress
    await fire("task_update", updateOutput({ ...fixture, status: "in_progress" }))

    //#then: the file is unchanged and no stamp was added
    expect(readBucketFile("demo-plan", onlyFile("demo-plan"))).toBe(before)
  })
})

describe("case 11: create-then-complete with no in_progress in between yields both", () => {
  test("the scaffold and the Completion stamp are both present", async () => {
    //#given: a task that goes straight from create to completed
    writePlan("demo-plan")
    const fixture = planFixture({ id: "T-11111111-2222-3333-4444-131313131313" })
    seedTask(fixture)
    await fire("task_create", createOutput(fixture))
    seedTask({ ...fixture, status: "completed" })

    //#when: task_update completes it without any intervening in_progress
    await fire("task_update", updateOutput({ ...fixture, status: "completed" }))

    //#then: both the scaffold header and the stamp survive
    const after = readBucketFile("demo-plan", onlyFile("demo-plan"))
    expect(after).toContain("# Task: Demo task")
    expect(after).toContain("## Results")
    expect(after).toContain("## Completion")
    expect(after).toContain("- status: completed")
  })
})

describe("case 12: unrelated tools are ignored", () => {
  test("a bash call writes no notepad file at all", async () => {
    //#given: a plan bucket that would otherwise receive a file
    writePlan("demo-plan")
    const fixture = planFixture({ id: "T-11111111-2222-3333-4444-141414141414" })
    seedTask(fixture)

    //#when: an unrelated tool fires with a task-like payload
    await fire("bash", { title: "bash", output: JSON.stringify(fixture), metadata: {} })

    //#then: no notepad root is created
    expect(existsSync(notepadsRoot)).toBe(false)
  })
})
