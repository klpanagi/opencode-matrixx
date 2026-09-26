#!/usr/bin/env bun
/**
 * Task 5 QA — a pre-upgrade session's todo list is still honoured.
 *
 * Given: a mocked client whose `session.todo()` returns ONE incomplete item,
 *        and a fresh module registry (so the one-time latch is unset)
 * When:  `hasIncompleteTodos` runs twice
 * Then:  it returns `true` (the real read is retained, NOT a `false` stub),
 *        the read actually happened (call count > 0), and EXACTLY ONE
 *        deprecation line was appended to the plugin log.
 *
 * This is the real behavioural half of the plan's QA row 2. It reads the
 * deprecation count out of the actual log file the logger writes, so a second
 * emission would be detected.
 */

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { hasIncompleteTodos, resetSessionTodoReadDeprecationWarning } from "../src/hooks/session-todo-status"

const LOG_FILE = path.join(os.tmpdir(), "matrixx.log")
const MARKER = "[session-todo-status]"

let failures = 0
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`)
}

let callCount = 0
const ctx = {
  directory: import.meta.dir,
  client: {
    session: {
      todo: async () => {
        callCount += 1
        return {
          data: [
            { id: "todo-0", content: "finish the migration", status: "pending", priority: "high" },
          ],
        }
      },
    },
  },
} as unknown as PluginInput

resetSessionTodoReadDeprecationWarning()
const before = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, "utf-8").split(MARKER).length - 1 : 0

const first = await hasIncompleteTodos(ctx, "ses_pre_upgrade")
const second = await hasIncompleteTodos(ctx, "ses_pre_upgrade")

const after = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, "utf-8").split(MARKER).length - 1 : 0
const emitted = after - before

check("hasIncompleteTodos returns true for one incomplete item", first === true, `got ${first}`)
check("hasIncompleteTodos is stable on a second call", second === true, `got ${second}`)
check("the real session.todo() read happened", callCount > 0, `callCount=${callCount}`)
check("exactly one deprecation line was emitted", emitted === 1, `emitted=${emitted}`)

console.log(`\n[RESULT] ${failures === 0 ? "SESSION TODO READ ALL PASS" : `${failures} FAILURES`}`)
if (failures > 0) process.exit(1)
