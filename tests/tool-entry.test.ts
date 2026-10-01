//#given a side-effect-free tool entry for bench/sandbox use
//#when imported without plugin context
//#then factories resolve and execute without spawning subprocesses

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("tool-entry (issue #158)", () => {
  test("re-exports plan tool factories", async () => {
    const entry = await import("../src/tool-entry")
    for (const name of [
      "createPlanCreateTool",
      "createPlanReadTool",
      "createPlanUpdateTool",
      "createPlanDeleteTool",
      "createPlanListTool",
      "createPlanTasksTool",
    ] as const) {
      expect(typeof (entry as Record<string, unknown>)[name], name).toBe("function")
    }
  })

  test("createPlanCreateTool works without plugin ctx", async () => {
    const { createPlanCreateTool } = await import("../src/tool-entry")
    const tool = createPlanCreateTool(undefined)
    expect(typeof tool.execute).toBe("function")
    const name = `tool-entry-${process.pid}-${Date.now()}.md`
    const res = String(
      await tool.execute(
        { filePath: `/tmp/tool-entry-test/.matrixx/plans/${name}`, content: "# hi\n" },
        { directory: "/tmp/tool-entry-test", sessionID: "ses_test" } as never,
      ),
    )
    expect(res).toContain('"success":true')
  })

  test("plugin entry exports no tool factories (boundary locked)", () => {
    const src = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8")
    for (const name of ["createPlanCreateTool", "createPlanUpdateTool", "createPlanReadTool"]) {
      expect(src.includes(name)).toBe(false)
    }
  })

  test("tool entry pulls no tmux/manager graph", () => {
    const src = readFileSync(join(import.meta.dir, "../src/tool-entry.ts"), "utf8")
    const code = src
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n")
    for (const banned of ["startTmuxCheck", "createManagers", "createHooks", "injectServerAuth"]) {
      expect(code.includes(banned)).toBe(false)
    }
  })
})
