import { describe, expect, test } from "bun:test"
import {
  isWallclockEnabled,
  remainingMs,
  WallclockSupervisor,
} from "../../../src/features/background-agent/wallclock"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe("WallclockSupervisor", () => {
  test("fires exactly once after expiry and never refires", async () => {
    //#given
    const supervisor = new WallclockSupervisor()
    let fireCount = 0
    let lastElapsed = -1

    //#when
    supervisor.arm("task-1", Date.now(), 20, () => {
      fireCount += 1
      lastElapsed = Date.now()
    })
    expect(lastElapsed).toBe(-1)
    await sleep(60)
    const countAfterFirstWait = fireCount
    await sleep(60)

    //#then
    expect(countAfterFirstWait).toBe(1)
    expect(fireCount).toBe(1)
    expect(supervisor.size()).toBe(0)
    supervisor.disarmAll()
  })

  test("disarm prevents fire", async () => {
    //#given
    const supervisor = new WallclockSupervisor()
    let fireCount = 0

    //#when
    supervisor.arm("task-2", Date.now(), 20, () => {
      fireCount += 1
    })
    const removed = supervisor.disarm("task-2")
    await sleep(60)

    //#then
    expect(removed).toBe(true)
    expect(fireCount).toBe(0)
    expect(supervisor.size()).toBe(0)
  })

  test("disarmAll clears pending deadlines", async () => {
    //#given
    const supervisor = new WallclockSupervisor()
    let fireCount = 0

    //#when
    supervisor.arm("task-a", Date.now(), 20, () => {
      fireCount += 1
    })
    supervisor.arm("task-b", Date.now(), 20, () => {
      fireCount += 1
    })
    expect(supervisor.size()).toBe(2)
    supervisor.disarmAll()
    await sleep(60)

    //#then
    expect(supervisor.size()).toBe(0)
    expect(fireCount).toBe(0)
  })

  test("re-arm replaces existing entry with a single fire", async () => {
    //#given
    const supervisor = new WallclockSupervisor()
    let fireCount = 0

    //#when
    supervisor.arm("task-3", Date.now(), 15, () => {
      fireCount += 1
    })
    supervisor.arm("task-3", Date.now(), 40, () => {
      fireCount += 1
    })
    expect(supervisor.size()).toBe(1)
    await sleep(25)

    //#then
    expect(fireCount).toBe(0)
    await sleep(60)
    expect(fireCount).toBe(1)
    expect(supervisor.size()).toBe(0)
    supervisor.disarmAll()
  })

  test("zero or undefined timeout never arms", () => {
    //#given
    const supervisor = new WallclockSupervisor()
    let fireCount = 0
    const onFire = (): void => {
      fireCount += 1
    }

    //#when
    supervisor.arm("task-off-zero", Date.now(), 0, onFire)
    supervisor.arm("task-off-undef", Date.now(), undefined, onFire)

    //#then
    expect(supervisor.size()).toBe(0)
    expect(supervisor.getDeadlineAt("task-off-zero")).toBeUndefined()
    expect(supervisor.getDeadlineAt("task-off-undef")).toBeUndefined()
    expect(fireCount).toBe(0)
  })

  test("getDeadlineAt tracks armed deadline and clears after disarm", () => {
    //#given
    const supervisor = new WallclockSupervisor()
    const startedAt = Date.now()

    //#when
    supervisor.arm("task-4", startedAt, 10_000, () => {})

    //#then
    expect(supervisor.getDeadlineAt("task-4")).toBe(startedAt + 10_000)
    expect(supervisor.disarm("task-4")).toBe(true)
    expect(supervisor.getDeadlineAt("task-4")).toBeUndefined()
    expect(supervisor.disarm("task-4")).toBe(false)
  })

  test("remainingMs computes deadline minus now", () => {
    //#given
    const startedAt = 1_000
    const timeout = 5_000

    //#when
    const remaining = remainingMs(startedAt, timeout, 3_000)
    const expired = remainingMs(startedAt, timeout, 7_000)

    //#then
    expect(remaining).toBe(3_000)
    expect(expired).toBe(-1_000)
  })

  test("isWallclockEnabled rejects zero and undefined only", () => {
    //#given
    const cases: Array<[number | undefined, boolean]> = [
      [undefined, false],
      [0, false],
      [1, true],
      [60_000, true],
    ]

    //#when
    const results = cases.map(([input]) => isWallclockEnabled(input))

    //#then
    expect(results).toEqual(cases.map(([, expected]) => expected))
  })

  test("fire context carries elapsed and limit", async () => {
    //#given
    const supervisor = new WallclockSupervisor()
    const startedAt = Date.now() - 100
    let taskId = ""
    let elapsedMs = -1
    let limitMs = -1

    //#when
    supervisor.arm("task-ctx", startedAt, 20, (ctx) => {
      taskId = ctx.taskId
      elapsedMs = ctx.elapsedMs
      limitMs = ctx.limitMs
    })
    await sleep(60)

    //#then
    expect(taskId).toBe("task-ctx")
    expect(limitMs).toBe(20)
    expect(elapsedMs).toBeGreaterThanOrEqual(0)
    supervisor.disarmAll()
  })
})
