/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

const TEST_DIR = join(tmpdir(), `matrixx-task3-${randomUUID()}`)
const TEST_SESSION_STORAGE = join(TEST_DIR, "session")
const TEST_MESSAGE_STORAGE = join(TEST_DIR, "message")
const TEST_PART_STORAGE = join(TEST_DIR, "part")

mock.module("../../../src/tools/session-manager/constants", () => ({
  OPENCODE_STORAGE: TEST_DIR,
  MESSAGE_STORAGE: TEST_MESSAGE_STORAGE,
  PART_STORAGE: TEST_PART_STORAGE,
  SESSION_STORAGE: TEST_SESSION_STORAGE,
  TODO_DIR: join(TEST_DIR, "todos"),
  TRANSCRIPT_DIR: join(TEST_DIR, "transcripts"),
  SESSION_LIST_DESCRIPTION: "test",
  SESSION_READ_DESCRIPTION: "test",
  SESSION_SEARCH_DESCRIPTION: "test",
  SESSION_INFO_DESCRIPTION: "test",
  SESSION_DELETE_DESCRIPTION: "test",
  TOOL_NAME_PREFIX: "session_",
}))

mock.module("../../../src/shared/opencode-storage-detection", () => ({
  isSqliteBackend: () => false,
  resetSqliteBackendCache: () => {},
}))

mock.module("../../../src/shared/opencode-message-dir", () => ({
  getMessageDir: () => null,
}))

const storage = await import("../../../src/tools/session-manager/storage")

function writeSession(projectID: string, sessionID: string, meta: Record<string, unknown>) {
  const dir = join(TEST_SESSION_STORAGE, projectID)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionID}.json`), JSON.stringify(meta))
}

describe("task3 DWF-miss reproduction", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(TEST_SESSION_STORAGE, { recursive: true })
    mkdirSync(TEST_MESSAGE_STORAGE, { recursive: true })
    mkdirSync(TEST_PART_STORAGE, { recursive: true })
  })
  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
  })

  test("trailing-slash session is found with normalized filter", async () => {
    //#given
    const now = Date.now()
    writeSession("proj_a", "ses_trailing", {
      id: "ses_trailing",
      projectID: "proj_a",
      directory: "/proj/",
      time: { created: now - 1000, updated: now },
    })
    //#when
    const sessions = await storage.getMainSessions({ directory: "/proj" })
    //#then
    expect(sessions.map((s) => s.id)).toContain("ses_trailing")
  })

  test("symlinked cwd resolves to stored realpath", async () => {
    //#given
    const now = Date.now()
    const realDir = join(TEST_DIR, "realproj")
    mkdirSync(realDir, { recursive: true })
    const linkDir = join(TEST_DIR, "linkproj")
    try {
      symlinkSync(realDir, linkDir)
    } catch {
      return
    }
    const { realpathSync } = await import("node:fs")
    const storedDir = realpathSync(linkDir)
    writeSession("proj_b", "ses_link", {
      id: "ses_link",
      projectID: "proj_b",
      directory: storedDir,
      time: { created: now - 1000, updated: now },
    })
    //#when
    const sessions = await storage.getMainSessions({ directory: linkDir })
    //#then
    expect(sessions.map((s) => s.id)).toContain("ses_link")
  })

  test("parentID child session is visible annotated, not silently dropped", async () => {
    //#given
    const now = Date.now()
    writeSession("proj_c", "ses_parent", {
      id: "ses_parent",
      projectID: "proj_c",
      directory: "/proj",
      time: { created: now - 2000, updated: now - 1000 },
    })
    writeSession("proj_c", "ses_child", {
      id: "ses_child",
      projectID: "proj_c",
      directory: "/proj",
      parentID: "ses_parent",
      time: { created: now - 1000, updated: now },
    })
    //#when
    const sessions = await storage.getMainSessions({ directory: "/proj" })
    const child = sessions.find((s) => s.id === "ses_child")
    //#then
    expect(child).toBeDefined()
    expect(child?.parentID).toBe("ses_parent")
    expect((child as unknown as Record<string, unknown>)["isChild"]).toBe(true)
  })
})
