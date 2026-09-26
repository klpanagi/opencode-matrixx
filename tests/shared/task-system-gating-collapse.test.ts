/// <reference types="bun-types" />
import { describe, test, expect, beforeEach } from "bun:test"
import { existsSync, closeSync, openSync, readSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  TASK_SYSTEM_DEFAULT,
  bindTaskSystemDeprecationToast,
  isTaskSystemEnabled,
  resetTaskSystemDeprecationWarning,
  resolveTasksConfig,
} from "../../src/shared/task-system-gating"

const LOG_FILE = join(tmpdir(), "matrixx.log")
const MARKER = "[task-system-legacy-keys]"

const MAX_CAPTURE = 65536

function logSize(): number {
  return existsSync(LOG_FILE) ? statSync(LOG_FILE).size : 0;
}

function appendedSince(size: number): string {
  if (!existsSync(LOG_FILE)) return "";
  const current = statSync(LOG_FILE).size;
  if (current <= size) return "";
  const length = Math.min(current - size, MAX_CAPTURE);
  const buffer = Buffer.alloc(length);
  const fd = openSync(LOG_FILE, "r");
  try {
    readSync(fd, buffer, 0, length, current - length);
  } finally {
    closeSync(fd);
  }
  return buffer.toString("utf8");
}

describe("task-system gating collapse", () => {
  beforeEach(() => {
    resetTaskSystemDeprecationWarning()
    bindTaskSystemDeprecationToast(undefined)
  })

  describe("resolution", () => {
    test("resolveTasksConfig({}) returns the canonical defaults", () => {
      //#given an empty plugin config
      const config = {}

      //#when the tasks config is resolved
      const resolved = resolveTasksConfig(config)

      //#then the task system is on and the documented defaults hold
      expect(resolved.enabled).toBe(true)
      expect(resolved.scope).toBe("project")
      expect(resolved.session_scoped).toBe(true)
    })

    test("enabled is always TASK_SYSTEM_DEFAULT, never a hardcoded literal", () => {
      //#given the exported collapse target
      expect(TASK_SYSTEM_DEFAULT).toBe(true)

      //#then every resolved config reports exactly that value
      expect(resolveTasksConfig({}).enabled).toBe(TASK_SYSTEM_DEFAULT)
      expect(
        resolveTasksConfig({ experimental: { task_system: false } }).enabled,
      ).toBe(TASK_SYSTEM_DEFAULT)
      expect(resolveTasksConfig({ new_task_system_enabled: false }).enabled).toBe(
        TASK_SYSTEM_DEFAULT,
      )
      expect(resolveTasksConfig({ tasks: { enabled: false } }).enabled).toBe(
        TASK_SYSTEM_DEFAULT,
      )
    })

    test("legacy experimental.task_system=false no longer disables the task system", () => {
      //#given a config pinning the legacy experimental flag off
      const config = { experimental: { task_system: false } }

      //#when gating is consulted
      //#then the task system stays enabled
      expect(isTaskSystemEnabled(config)).toBe(true)
    })

    test("legacy new_task_system_enabled=false no longer disables the task system", () => {
      //#given a config pinning the legacy top-level flag off
      const config = { new_task_system_enabled: false }

      //#when gating is consulted
      //#then the task system stays enabled
      expect(isTaskSystemEnabled(config)).toBe(true)
    })

    test("tasks.enabled=false no longer disables the task system", () => {
      //#given a config turning the canonical switch off
      const config = { tasks: { enabled: false } }

      //#when gating is consulted
      //#then the task system stays enabled
      expect(isTaskSystemEnabled(config)).toBe(true)
    })

    test("the other six resolved fields survive the collapse", () => {
      //#given a config that only sets the canonical storage keys
      const config = {
        tasks: { enabled: true, scope: "global" as const, storage_path: "/tmp/x", task_list_id: "L" },
        morpheus: { tasks: { stale_after_hours: 48 } },
        task: { pollTimeoutMs: 120000 },
      }

      //#when the tasks config is resolved
      const resolved = resolveTasksConfig(config)

      //#then every non-enabled field is still derived from its fallbacks
      expect(resolved.scope).toBe("global")
      expect(resolved.storage_path).toBe("/tmp/x")
      expect(resolved.task_list_id).toBe("L")
      expect(resolved.stale_after_hours).toBe(48)
      expect(resolved.session_scoped).toBe(true)
      expect(resolved.pollTimeoutMs).toBe(120000)
    })
  })

  describe("deprecation warning", () => {
    test("all three legacy keys are named in the log", () => {
      //#given a fresh log offset
      const before = logSize()

      //#when a config with all three legacy switches off is resolved
      resolveTasksConfig({
        experimental: { task_system: false },
        new_task_system_enabled: false,
        tasks: { enabled: false },
      })

      //#then every key is named
      const written = appendedSince(before)
      expect(written).toContain(MARKER)
      expect(written).toContain("experimental.task_system")
      expect(written).toContain("new_task_system_enabled")
      expect(written).toContain("tasks.enabled")
    })

    test("tasks.enabled gets the loudest wording", () => {
      //#given a fresh log offset
      const before = logSize()

      //#when only tasks.enabled=false is present
      resolveTasksConfig({ tasks: { enabled: false } })

      //#then the wording says it used to work and is now ignored
      const written = appendedSince(before)
      expect(written).toContain("was working until this release and is now ignored")
      expect(written).toContain("tasks.enabled=false")
      expect(written).toContain("has no effect at all")
      expect(written).toContain("Remove `tasks.enabled`")
    })

    test("the warning is emitted exactly once per session", () => {
      //#given a fresh log offset
      const before = logSize()

      //#when the same legacy config is resolved twice
      const config = { tasks: { enabled: false } }
      resolveTasksConfig(config)
      resolveTasksConfig(config)

      //#then only one deprecation line was written
      const occurrences = appendedSince(before).split(MARKER).length - 1
      expect(occurrences).toBe(1)
    })

    test("a clean config logs nothing", () => {
      //#given a fresh log offset
      const before = logSize()

      //#when a config without legacy switches is resolved
      resolveTasksConfig({ tasks: { enabled: true, scope: "global" } })

      //#then no deprecation line is written
      expect(appendedSince(before)).not.toContain(MARKER)
    })

    test("resolution never throws on legacy keys", () => {
      //#given a config object carrying every legacy switch off
      const config = {
        experimental: { task_system: false },
        new_task_system_enabled: false,
        tasks: { enabled: false },
      }

      //#then resolution returns normally instead of throwing
      expect(() => resolveTasksConfig(config)).not.toThrow()
    })
  })

  describe("startup toast", () => {
    test("one toast is emitted for the whole session", () => {
      //#given a client that records toasts
      const toasts: string[] = []
      bindTaskSystemDeprecationToast({
        tui: {
          showToast: (input: unknown) => {
            const body = (input as { body?: { message?: string } }).body
            toasts.push(body?.message ?? "")
            return Promise.resolve()
          },
        },
      })

      //#when two legacy configs are resolved
      const config = { tasks: { enabled: false } }
      resolveTasksConfig(config)
      resolveTasksConfig(config)

      //#then exactly one toast was shown
      expect(toasts.length).toBe(1)
      expect(toasts[0]).toContain("tasks.enabled")
    })

    test("a missing tui client does not throw", () => {
      //#given a client with no tui surface
      bindTaskSystemDeprecationToast({})

      //#then resolving a legacy config still works
      expect(() => resolveTasksConfig({ tasks: { enabled: false } })).not.toThrow()
    })

    test("no toast surfaces when the client is unbound", () => {
      //#given a fresh log offset
      const before = logSize()

      //#when a legacy config is resolved with no client bound
      bindTaskSystemDeprecationToast(undefined)
      resolveTasksConfig({ tasks: { enabled: false } })

      //#then the warning is still logged
      expect(appendedSince(before)).toContain(MARKER)
    })
  })
})
