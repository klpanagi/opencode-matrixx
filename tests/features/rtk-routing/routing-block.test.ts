/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { buildRtkRoutingBlock, containsRtkMarker, MATRIXX_RTK_MARKER } from "../../../src/features/rtk-routing/routing-block"

describe("MATRIXX_RTK_MARKER", () => {
  test("is the rtk discipline marker", () => {
    //#given
    //#when
    const marker = MATRIXX_RTK_MARKER

    //#then
    expect(marker).toBe("<rtk_discipline>")
  })
})

describe("buildRtkRoutingBlock", () => {
  test("opens with the marker and closes the block", () => {
    //#given
    //#when
    const block = buildRtkRoutingBlock()

    //#then
    expect(block.startsWith(MATRIXX_RTK_MARKER)).toBe(true)
    expect(block).toContain("</rtk_discipline>")
  })

  test("mentions rtk and the rewriter hook", () => {
    //#given
    //#when
    const block = buildRtkRoutingBlock()

    //#then
    expect(block).toContain("rtk")
    expect(block).toContain("rtk-bash-rewriter")
  })

  test("stays within the 14-line budget", () => {
    //#given
    //#when
    const block = buildRtkRoutingBlock()

    //#then
    expect(block.split("\n").length).toBeLessThanOrEqual(14)
  })
})

describe("containsRtkMarker", () => {
  test("returns true when the marker is present", () => {
    //#given
    const system = ["sys-a", `prior ${MATRIXX_RTK_MARKER} block`]

    //#when
    const result = containsRtkMarker(system)

    //#then
    expect(result).toBe(true)
  })

  test("returns false when the marker is absent", () => {
    //#given
    const system = ["sys-a", "sys-b"]

    //#when
    const result = containsRtkMarker(system)

    //#then
    expect(result).toBe(false)
  })
})
