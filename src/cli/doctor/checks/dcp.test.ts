/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { buildDcpConfusionDetail, dcpCheck } from "./dcp"

describe("dcpCheck confusion detection", () => {
  test("external-DCP-present + Matrixx enabled names both systems and log pointers", () => {
    //#given
    const input = { dcpEnabled: true as boolean | null, dcpInstalled: true, matrixxHooksEnabled: true }

    //#when
    const detail = buildDcpConfusionDetail(input)

    //#then
    expect(detail).not.toBeNull()
    expect(detail as string).toContain("external DCP")
    expect(detail as string).toContain("evolution-compressor")
    expect(detail as string).toContain("truncates")
    expect(detail as string).toContain("trace-store only")
    expect(detail as string).toContain("-383K/+80K")
    expect(detail as string).toContain("[evolution-compressor]")
  })

  test("dcp disabled + Matrixx enabled says Matrixx cannot drop context", () => {
    //#given
    const input = { dcpEnabled: false as boolean | null, dcpInstalled: false, matrixxHooksEnabled: true }

    //#when
    const detail = buildDcpConfusionDetail(input)

    //#then
    expect(detail).not.toBeNull()
    expect(detail as string).toContain("cannot drop context")
  })

  test("existing branches unbroken: check returns named warn/pass result", async () => {
    //#given
    //#when
    const result = await dcpCheck.check()

    //#then
    expect(result.name).toBe("dcp-integration")
    expect(["pass", "warn"]).toContain(result.status)
    expect(typeof result.message).toBe("string")
  })
})
