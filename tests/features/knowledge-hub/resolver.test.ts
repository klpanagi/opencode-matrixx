import { describe, expect, it } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { LoadedHub } from "../../../src/features/knowledge-hub/loader"
import { resolveKnowledgeFile } from "../../../src/features/knowledge-hub/resolver"

function makeHub(name: string): LoadedHub {
  const root = mkdtempSync(join(tmpdir(), `kh-resolve-${name}-`))
  return {
    name,
    root,
    indexPath: join(root, "_index.md"),
    scope: "global",
    mode: "router-only",
    exclude: [],
  }
}

describe("resolveKnowledgeFile", () => {
  it("resolves hub:name/path to a jailed absolute path", () => {
    const hub = makeHub("kb")
    expect(resolveKnowledgeFile([hub], "hub:kb/guide/intro.md")).toBe(
      join(hub.root, "guide/intro.md")
    )
  })

  it("resolves the @name/path form identically", () => {
    const hub = makeHub("kb")
    expect(resolveKnowledgeFile([hub], "@kb/guide/intro.md")).toBe(
      join(hub.root, "guide/intro.md")
    )
  })

  it("returns the hub index when no relative path is given", () => {
    const hub = makeHub("kb")
    expect(resolveKnowledgeFile([hub], "hub:kb")).toBe(hub.indexPath)
    expect(resolveKnowledgeFile([hub], "@kb")).toBe(hub.indexPath)
  })

  it("rejects .. escapes above the hub root", () => {
    const hub = makeHub("kb")
    expect(resolveKnowledgeFile([hub], "hub:kb/../escape.md")).toBeNull()
    expect(resolveKnowledgeFile([hub], "hub:kb/sub/../../escape.md")).toBeNull()
    expect(resolveKnowledgeFile([hub], "@kb/..")).toBeNull()
  })

  it("returns null for unknown hubs and absolute-path input", () => {
    const hub = makeHub("kb")
    expect(resolveKnowledgeFile([hub], "hub:nope/file.md")).toBeNull()
    expect(resolveKnowledgeFile([hub], "@nope/file.md")).toBeNull()
    expect(resolveKnowledgeFile([hub], "hub:kb//etc/passwd")).toBeNull()
    expect(resolveKnowledgeFile([hub], "plain-relative.md")).toBeNull()
  })
})
