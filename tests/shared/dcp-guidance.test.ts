/// <reference types="bun-types" />

import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  _resetDcpGuidanceForTesting,
  _setDcpConfigPathForTesting,
  resolveDcpCompressionMode,
} from "../../src/shared/dcp-guidance"

async function writeFixture(name: string, content: string): Promise<string> {
  const path = join(tmpdir(), `matrixx-dcp-guidance-${name}.jsonc`)
  await Bun.write(path, content)
  return path
}

describe("resolveDcpCompressionMode", () => {
  afterEach(() => {
    //#given each test mutates the override
    //#when it finishes then reset isolation is restored
    _resetDcpGuidanceForTesting()
  })

  test("returns none when no config path is set", () => {
    //#given DCP config absent entirely
    //#when resolving guidance
    _setDcpConfigPathForTesting(null)
    //#then no compress tool is advertised
    expect(resolveDcpCompressionMode()).toBe("none")
  })

  test("returns none when the config file is missing", () => {
    //#given a path that points at nothing
    //#when resolving guidance
    _setDcpConfigPathForTesting(join(tmpdir(), "matrixx-dcp-guidance-absent.jsonc"))
    //#then no compress tool is advertised
    expect(resolveDcpCompressionMode()).toBe("none")
  })

  test("returns guided for an active DCP config", async () => {
    //#given DCP enabled with allow permission and automatic mode
    //#when resolving guidance
    const path = await writeFixture(
      "active",
      `{"enabled": true, "compress": {"permission": "allow"}, "manualMode": {"enabled": false}}`,
    )
    _setDcpConfigPathForTesting(path)
    //#then guided compression applies
    expect(resolveDcpCompressionMode()).toBe("guided")
  })

  test("returns none when DCP is disabled", async () => {
    //#given DCP explicitly disabled
    //#when resolving guidance
    const path = await writeFixture(
      "disabled",
      `{"enabled": false, "compress": {"permission": "allow"}}`,
    )
    _setDcpConfigPathForTesting(path)
    //#then no compress tool is advertised
    expect(resolveDcpCompressionMode()).toBe("none")
  })

  test("returns none when compress permission is deny", async () => {
    //#given the compress tool unregistered by DCP
    //#when resolving guidance
    const path = await writeFixture(
      "deny",
      `{"enabled": true, "compress": {"permission": "deny"}}`,
    )
    _setDcpConfigPathForTesting(path)
    //#then no compress tool is advertised
    expect(resolveDcpCompressionMode()).toBe("none")
  })

  test("returns manual when manualMode is enabled", async () => {
    //#given DCP in manual mode with no autonomous nudges
    //#when resolving guidance
    const path = await writeFixture(
      "manual",
      `{"enabled": true, "compress": {"permission": "allow"}, "manualMode": {"enabled": true}}`,
    )
    _setDcpConfigPathForTesting(path)
    //#then trigger-only mode applies
    expect(resolveDcpCompressionMode()).toBe("manual")
  })

  test("guided mode is config-driven: minimal enabled-only config needs no nudge text", async () => {
    //#given DCP enabled with no nudge fields whatsoever
    //#when resolving guidance
    const path = await writeFixture("minimal-enabled", `{"enabled": true}`)
    _setDcpConfigPathForTesting(path)
    //#then guided still applies — no nudge text drives the mode
    expect(resolveDcpCompressionMode()).toBe("guided")
  })

  test("extraneous nudge-like text does not change guided resolution", async () => {
    //#given an enabled config carrying nudge-like prose in an unknown field
    //#when resolving guidance
    const path = await writeFixture(
      "nudge-noise",
      `{"enabled": true, "compress": {"permission": "allow"}, "note": "CRITICAL WARNING trigger nudge"}`,
    )
    _setDcpConfigPathForTesting(path)
    //#then the mode still follows config fields, not nudge text
    expect(resolveDcpCompressionMode()).toBe("guided")
  })
})
