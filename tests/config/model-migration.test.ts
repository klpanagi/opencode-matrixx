import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { MatrixxConfigSchema } from "../../src/config/schema/matrixx-config"
import { migrateMatrixxConfig, normalizeModelInput } from "../../src/config/migrations/model-migration"
import * as logger from "../../src/shared/logger"

describe("normalizeModelInput", () => {
  let logSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    logSpy = spyOn(logger, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  test("prefixed model emits deprecation warning and keeps value", () => {
    // #given
    const value = "provider-a/model-id"

    // #when
    const result = normalizeModelInput(value)

    // #then
    expect(result).toBe(value)
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[migration]"))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(value))
  })

  test("bare model does not warn", () => {
    // #given
    const value = "model-id"

    // #when
    const result = normalizeModelInput(value)

    // #then
    expect(result).toBe(value)
    expect(logSpy).not.toHaveBeenCalled()
  })

  test("prefixed with multiple slashes still warns (opaque provider check via includes)", () => {
    // #given
    const value = "provider-a/sub/model-id"

    // #when
    const result = normalizeModelInput(value)

    // #then
    expect(result).toBe(value)
    expect(logSpy).toHaveBeenCalledTimes(1)
  })
})

describe("migrateMatrixxConfig", () => {
  let logSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    logSpy = spyOn(logger, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  test("migrates global_model prefixed warns", () => {
    // #given
    const raw = { global_model: "provider-a/model-id" } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated.global_model).toBe("provider-a/model-id")
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(migrated._migrations).toContain("model-migration")
  })

  test("bare global_model does not warn", () => {
    // #given
    const raw = { global_model: "model-id" } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated.global_model).toBe("model-id")
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("[migration] prefixed"))
    expect(migrated._migrations).toContain("model-migration")
  })

  test("migrates modelRequirements agents and categories fallbackChain", () => {
    // #given
    const raw = {
      modelRequirements: {
        agents: {
          myAgent: {
            fallbackChain: [{ providers: ["provider-a"], model: "provider-a/model-id" }],
          },
        },
        categories: {
          myCategory: {
            fallbackChain: [
              { providers: ["provider-b"], model: "model-id" },
              { providers: ["provider-c"], model: "provider-c/other-model" },
            ],
          },
        },
      },
    } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated.modelRequirements?.agents?.myAgent?.fallbackChain[0].model).toBe("provider-a/model-id")
    expect(migrated.modelRequirements?.categories?.myCategory?.fallbackChain[0].model).toBe("model-id")
    expect(migrated.modelRequirements?.categories?.myCategory?.fallbackChain[1].model).toBe("provider-c/other-model")
    expect(logSpy).toHaveBeenCalledTimes(2)
  })

  test("migrates complexityDowngrades values", () => {
    // #given
    const raw = {
      complexityDowngrades: {
        myCategory: { "1": "provider-a/model-id", "2": "model-id-2" },
        other: { "1": "model-id" },
      },
    } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated.complexityDowngrades?.myCategory?.["1"]).toBe("provider-a/model-id")
    expect(migrated.complexityDowngrades?.myCategory?.["2"]).toBe("model-id-2")
    expect(migrated.complexityDowngrades?.other?.["1"]).toBe("model-id")
    expect(logSpy).toHaveBeenCalledTimes(1) // only provider-a/model-id warns, bare models no warn
  })

  test("is idempotent via _migrations guard", () => {
    // #given
    const raw = { global_model: "provider-a/model-id" } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig
    const once = migrateMatrixxConfig(raw)

    // #when
    logSpy.mockClear()
    const twice = migrateMatrixxConfig(once)

    // #then
    expect(twice).toBe(once) // same reference when already migrated
    expect(logSpy).not.toHaveBeenCalled()
  })

  test("does not rewrite file on disk — returns new object", () => {
    // #given
    const raw = { global_model: "provider-a/model-id" } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated).not.toBe(raw)
    expect(raw._migrations).toBeUndefined()
  })

  test("existing matrixx.jsonc with prefixed model loads without Zod error (z.string not enum)", () => {
    // #given
    const raw = { global_model: "provider-a/model-id" }

    // #when
    const result = MatrixxConfigSchema.safeParse(raw)

    // #then
    expect(result.success).toBe(true)
  })
})
