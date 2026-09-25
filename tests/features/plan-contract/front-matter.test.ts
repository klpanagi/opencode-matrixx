/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import {
  isGrandfathered,
  parsePlanFrontMatter,
  serializePlanFrontMatter,
  shouldMigrate,
  type PlanFrontMatter,
} from "../../../src/features/plan-contract"
import { GRANDFATHER_ALLOWLIST } from "../../../src/features/plan-contract/migration"
import { parseMetadataComment, upsertMetadataComment } from "../../../src/features/mission-state/plan-storage"

/**
 * Legacy `plan-persister` metadata comment fixture (no YAML front-matter).
 * Mirrors the real real-world shape written by `upsertMetadataComment`.
 */
const LEGACY_COMMENT =
  '<!-- plan-persister: {"id":"input-secret-guard-plan","updatedAt":"2026-09-07T16:47:07.770Z","sessionId":"ses_legacy","todoTotal":5,"todoCompleted":2} -->'

function requireFrontMatter(content: string): PlanFrontMatter {
  const parsed = parsePlanFrontMatter(content)
  if (parsed === null) throw new Error("expected front-matter to parse, got null")
  return parsed
}

/** Apply-on-next-edit injection: additive, idempotent, never touches the body. */
function injectFrontMatter(content: string, fm: PlanFrontMatter): string {
  if (!shouldMigrate(content)) return content
  return `${serializePlanFrontMatter(fm)}${content}`
}

describe("parsePlanFrontMatter", () => {
  test("returns null when no front-matter block is present", () => {
    //#given a legacy plan body without a fenced YAML block
    const content = "# Plan\n\nSome body text.\n"

    //#when parsing front-matter
    const parsed = parsePlanFrontMatter(content)

    //#then it reports absence rather than throwing
    expect(parsed).toBeNull()
  })

  test("returns null for malformed YAML", () => {
    //#given a fenced block containing invalid YAML
    const content = "---\nstatus: [unclosed\n---\n# Plan\n"

    //#when parsing front-matter
    const parsed = parsePlanFrontMatter(content)

    //#then the malformed block is rejected
    expect(parsed).toBeNull()
  })

  test("returns null when a required field is missing", () => {
    //#given a block omitting the required status field
    const content = "---\nrevision: 1\n---\n# Plan\n"

    //#when parsing front-matter
    const parsed = parsePlanFrontMatter(content)

    //#then it is rejected
    expect(parsed).toBeNull()
  })

  test("normalizes numeric phase and wave to the string vocabulary", () => {
    //#given a plan whose phase/wave were written as bare numbers
    const content = "---\nstatus: in_progress\nrevision: 2\nphase: 1\nwave: 3\n---\n# Plan\n"

    //#when parsing front-matter
    const parsed = parsePlanFrontMatter(content)

    //#then scalar labels are coerced to strings
    expect(parsed?.phase).toBe("1")
    expect(parsed?.wave).toBe("3")
  })

  test("rejects an out-of-vocabulary status", () => {
    //#given a status outside the task-system enum
    const content = "---\nstatus: archived\nrevision: 1\n---\n# Plan\n"

    //#when parsing front-matter
    const parsed = parsePlanFrontMatter(content)

    //#then it is rejected
    expect(parsed).toBeNull()
  })
})

describe("serializePlanFrontMatter", () => {
  test("round-trips every field through serialize and parse", () => {
    //#given a fully populated front-matter record
    const fm: PlanFrontMatter = {
      status: "in_progress",
      revision: 2,
      phase: "1",
      wave: "3",
      deps: ["T-1"],
      blockedBy: ["T-9"],
    }

    //#when serializing then parsing
    const serialized = serializePlanFrontMatter(fm)
    const parsed = parsePlanFrontMatter(serialized)

    //#then all fields survive the round-trip unchanged
    expect(parsed).toEqual(fm)
  })

  test("omits absent optional fields", () => {
    //#given a minimal front-matter record
    const fm: PlanFrontMatter = { status: "pending", revision: 0 }

    //#when serializing
    const serialized = serializePlanFrontMatter(fm)

    //#then only the required keys are emitted
    expect(serialized).toContain("status: pending")
    expect(serialized).toContain("revision: 0")
    expect(serialized).not.toContain("phase:")
    expect(serialized).not.toContain("wave:")
    expect(serialized).not.toContain("deps:")
  })

  test("maps status to the task-system vocabulary", () => {
    //#given the three lifecycle statuses mirrored from task-update
    const statuses = ["pending", "in_progress", "completed"] as const

    for (const status of statuses) {
      //#when serializing and parsing each status
      const parsed = parsePlanFrontMatter(serializePlanFrontMatter({ status, revision: 1 }))

      //#then the status survives unchanged
      expect(parsed?.status).toBe(status)
    }
  })

  test("parse/serialize is idempotent", () => {
    //#given a plan with a leading front-matter block
    const content = "---\nstatus: pending\nrevision: 1\n---\n# Plan\n"

    //#when serialize(parse(x)) is applied twice
    const first = requireFrontMatter(content)
    const serializedOnce = serializePlanFrontMatter(first)
    const second = requireFrontMatter(serializedOnce)
    const serializedTwice = serializePlanFrontMatter(second)

    //#then the second and third parses agree and serialization is a fixed point
    expect(second).toEqual(first)
    expect(serializedTwice).toBe(serializedOnce)
  })
})

describe("legacy plan-persister comment compatibility", () => {
  test("is preserved byte-for-byte when front-matter is injected additively", () => {
    //#given a metadata-only plan and its parsed metadata
    const legacyContent = `# Input Secret Guard\n\nBody.\n\n${LEGACY_COMMENT}\n`
    const before = parseMetadataComment(legacyContent)
    expect(before).not.toBeNull()

    //#when front-matter is injected on the next edit
    const migrated = injectFrontMatter(legacyContent, { status: "pending", revision: 1 })

    //#then the front-matter parses and the legacy comment is untouched
    expect(parsePlanFrontMatter(migrated)).toEqual({ status: "pending", revision: 1 })
    expect(migrated).toContain(LEGACY_COMMENT)
    expect(parseMetadataComment(migrated)).toEqual(before)
  })

  test("upsertMetadataComment still replaces in place after front-matter is present", () => {
    //#given a plan carrying front-matter plus an existing metadata comment
    const migrated = injectFrontMatter(`${LEGACY_COMMENT}\n`, { status: "pending", revision: 1 })
    const before = parseMetadataComment(migrated)

    //#when upserting updated metadata
    const updated = upsertMetadataComment(migrated, {
      id: "input-secret-guard-plan",
      updatedAt: "2026-09-24T00:00:00.000Z",
      sessionId: "ses_new",
      todoTotal: 5,
      todoCompleted: 4,
    })

    //#then the comment is replaced (not duplicated) and front-matter survives
    expect(updated.match(/<!-- plan-persister:/g)).toHaveLength(1)
    expect(parseMetadataComment(updated)).toMatchObject({ todoCompleted: 4 })
    expect(parsePlanFrontMatter(updated)).toEqual({ status: "pending", revision: 1 })
    expect(before).not.toEqual(parseMetadataComment(updated))
  })
})

describe("isGrandfathered", () => {
  test("freezes the 23 pre-existing plan ids", () => {
    //#given the captured pre-existing plan corpus
    const allowlist = GRANDFATHER_ALLOWLIST

    //#when inspecting the frozen list
    //#then it is frozen and contains exactly the captured ids
    expect(Object.isFrozen(allowlist)).toBe(true)
    expect(allowlist).toHaveLength(23)
    expect(allowlist).toContain("input-secret-guard-plan")
    expect(allowlist).toContain("evolution-advancement-proposal")
    expect(allowlist).toContain("enforce-plan-tools-only-access")
    expect(allowlist).toContain("p2.1-trim-hooks")
  })

  test("returns true for an allowlisted metadata-less plan", () => {
    //#given an allowlisted pre-existing plan lacking front-matter
    const filePath = "input-secret-guard-plan.md"
    const content = `# Input Secret Guard\n\nBody.\n\n${LEGACY_COMMENT}\n`

    //#when checking grandfathering
    const result = isGrandfathered(filePath, content)

    //#then it is grandfathered
    expect(result).toBe(true)
  })

  test("returns false for a brand-new plan lacking front-matter", () => {
    //#given a non-allowlisted plan path with no front-matter
    const filePath = ".matrixx/plans/brand-new-plan.md"
    const content = "# x\n"

    //#when checking grandfathering
    const result = isGrandfathered(filePath, content)

    //#then absence of front-matter alone does NOT grandfather it
    expect(result).toBe(false)
  })

  test("returns false for an allowlisted plan once front-matter exists", () => {
    //#given an allowlisted plan that already carries front-matter
    const content = `${serializePlanFrontMatter({ status: "pending", revision: 1 })}# Input Secret Guard\n`

    //#when checking grandfathering
    const result = isGrandfathered("input-secret-guard-plan.md", content)

    //#then the presence of front-matter clears the exemption
    expect(result).toBe(false)
  })
})

describe("shouldMigrate", () => {
  test("returns true iff front-matter is absent", () => {
    //#given one plan without and one plan with front-matter
    const without = "# Plan\n\nBody.\n"
    const withFrontMatter = serializePlanFrontMatter({ status: "pending", revision: 1 })

    //#when checking migration need
    const needsWithout = shouldMigrate(without)
    const needsWith = shouldMigrate(withFrontMatter)

    //#then only the front-matter-less plan needs migration
    expect(needsWithout).toBe(true)
    expect(needsWith).toBe(false)
  })

  test("is idempotent across repeated injection", () => {
    //#given a legacy plan and a stable front-matter record
    const legacy = `# Plan\n\nBody.\n\n${LEGACY_COMMENT}\n`
    const fm: PlanFrontMatter = { status: "pending", revision: 1 }

    //#when migration is applied twice
    const once = injectFrontMatter(legacy, fm)
    const twice = injectFrontMatter(once, fm)

    //#then the second application is a no-op
    expect(once).not.toBe(legacy)
    expect(twice).toBe(once)
    expect(shouldMigrate(once)).toBe(false)
    expect(once.match(/^---/g)).toHaveLength(1)
  })
})
