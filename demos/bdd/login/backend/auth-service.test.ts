import { beforeEach, describe, expect, test } from "bun:test"
import { AuthService, LOCKOUT_DURATION_MS } from "./auth-service.ts"
import {
  seedFailedAttempts,
  seedLockoutCycle,
  seedUser,
} from "./seed.ts"
import {
  ClearAttemptsRequestSchema,
  ClearAttemptsResponseSchema,
  LoginErrorCodeSchema,
  LoginErrorSchema,
  LoginRequestSchema,
  LoginResponseSchema,
} from "./types.ts"

describe("Zod schemas", () => {
  test("LoginRequestSchema accepts a valid payload", () => {
    const parsed = LoginRequestSchema.safeParse({
      username: "alice",
      password: "wonderland",
    })
    expect(parsed.success).toBe(true)
  })

  test("LoginRequestSchema rejects empty username", () => {
    const parsed = LoginRequestSchema.safeParse({ username: "", password: "x" })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.length).toBeGreaterThan(0)
    }
  })

  test("LoginRequestSchema rejects empty password", () => {
    const parsed = LoginRequestSchema.safeParse({ username: "alice", password: "" })
    expect(parsed.success).toBe(false)
  })

  test("LoginRequestSchema rejects missing fields", () => {
    const parsed = LoginRequestSchema.safeParse({})
    expect(parsed.success).toBe(false)
  })

  test("LoginResponseSchema accepts the documented shape", () => {
    const parsed = LoginResponseSchema.safeParse({
      token: "tok_x",
      userId: "usr_x",
      expiresAt: "2026-01-01T00:00:00.000Z",
    })
    expect(parsed.success).toBe(true)
  })

  test("LoginResponseSchema rejects missing fields", () => {
    const parsed = LoginResponseSchema.safeParse({ token: "x" })
    expect(parsed.success).toBe(false)
  })

  test("ClearAttemptsRequestSchema requires non-empty username", () => {
    const ok = ClearAttemptsRequestSchema.safeParse({ username: "alice" })
    expect(ok.success).toBe(true)
    const bad = ClearAttemptsRequestSchema.safeParse({ username: "" })
    expect(bad.success).toBe(false)
  })

  test("ClearAttemptsResponseSchema accepts the documented shape", () => {
    const parsed = ClearAttemptsResponseSchema.safeParse({
      username: "alice",
      cleared: true,
    })
    expect(parsed.success).toBe(true)
  })

  test("LoginErrorCodeSchema covers every documented code", () => {
    for (const code of [
      "VALIDATION_ERROR",
      "INVALID_CREDENTIALS",
      "USER_NOT_FOUND",
      "ACCOUNT_LOCKED",
      "ACCOUNT_SUSPENDED",
      "INTERNAL_ERROR",
    ]) {
      expect(LoginErrorCodeSchema.safeParse(code).success).toBe(true)
    }
    expect(LoginErrorCodeSchema.safeParse("BOGUS").success).toBe(false)
  })

  test("LoginErrorSchema accepts every error code variant", () => {
    for (const code of [
      "VALIDATION_ERROR",
      "INVALID_CREDENTIALS",
      "USER_NOT_FOUND",
      "ACCOUNT_LOCKED",
      "ACCOUNT_SUSPENDED",
      "INTERNAL_ERROR",
    ]) {
      const parsed = LoginErrorSchema.safeParse({ code, message: "x" })
      expect(parsed.success).toBe(true)
    }
  })
})

describe("AuthService.login — happy-path scenarios", () => {
  let service: AuthService

  beforeEach(() => {
    service = new AuthService()
  })

  test("scenario 1: successful login returns 200 with token, userId, expiresAt", async () => {
    const result = await service.login({ username: "alice", password: "wonderland" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.token).toStartWith("tok_alice_")
      expect(result.value.userId).toBe("usr_alice")
      expect(() => new Date(result.value.expiresAt).toISOString()).not.toThrow()
      expect(new Date(result.value.expiresAt).getTime()).toBeGreaterThan(Date.now())
    }
  })

  test("scenario 2: migrated user logs in with non-email username", async () => {
    const result = await service.login({
      username: "alice.bank",
      password: "wonderland",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.userId).toBe("usr_alice.bank")
    }
  })

  test("successful login clears the attempt counter and lockout cycles", async () => {
    await service.login({ username: "alice", password: "wrong" })
    await service.login({ username: "alice", password: "wrong" })
    expect(service.getAttemptCount("alice")).toBe(2)

    const result = await service.login({ username: "alice", password: "wonderland" })
    expect(result.ok).toBe(true)
    expect(service.getAttemptCount("alice")).toBe(0)
    const state = service.getState("alice")
    expect(state?.lockoutCycles).toBe(0)
  })
})

describe("AuthService.login — 400 VALIDATION_ERROR", () => {
  let service: AuthService

  beforeEach(() => {
    service = new AuthService()
  })

  test("scenario 4a: empty username returns 400 VALIDATION_ERROR", async () => {
    const result = await service.login({ username: "", password: "wonderland" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR")
      expect(result.error.message.toLowerCase()).toContain("username")
    }
  })

  test("scenario 4b: empty password returns 400 VALIDATION_ERROR", async () => {
    const result = await service.login({ username: "alice", password: "" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR")
      expect(result.error.message.toLowerCase()).toContain("password")
    }
  })

  test("scenario 4c: empty fields returns 400 VALIDATION_ERROR", async () => {
    const result = await service.login({ username: "", password: "" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR")
    }
  })
})

describe("AuthService.login — 401 INVALID_CREDENTIALS", () => {
  let service: AuthService

  beforeEach(() => {
    service = new AuthService()
  })

  test("scenario 5: wrong password returns 401 and increments the attempt counter", async () => {
    const first = await service.login({ username: "alice", password: "wrong" })
    expect(first.ok).toBe(false)
    if (!first.ok) {
      expect(first.error.code).toBe("INVALID_CREDENTIALS")
    }
    expect(service.getAttemptCount("alice")).toBe(1)
  })

  test("scenario 5: unknown user also returns 401 (never disclose USER_NOT_FOUND on login)", async () => {
    const result = await service.login({ username: "ghost", password: "x" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CREDENTIALS")
    }
  })

  test("scenario 5: 401 message never discloses remaining attempts or lockout state", async () => {
    const result = await service.login({ username: "alice", password: "wrong" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const message = result.error.message.toLowerCase()
      expect(message).not.toContain("attempt")
      expect(message).not.toContain("lock")
      expect(message).not.toContain("remaining")
      expect(message).not.toMatch(/\d/)
    }
  })
})

describe("AuthService.login — 423 ACCOUNT_LOCKED lockout flow", () => {
  test("scenario 6: 3rd consecutive failure returns 423 and locks for 30 minutes", async () => {
    const service = new AuthService()
    await service.login({ username: "alice", password: "wrong" })
    await service.login({ username: "alice", password: "wrong" })
    const third = await service.login({ username: "alice", password: "wrong" })

    expect(third.ok).toBe(false)
    if (!third.ok) {
      expect(third.error.code).toBe("ACCOUNT_LOCKED")
      expect(third.error.message.toLowerCase()).toContain("locked")
    }

    const state = service.getState("alice")
    expect(state?.isLocked).toBe(true)
    const lockedUntil = state?.lockedUntil ?? 0
    expect(lockedUntil).toBeGreaterThan(Date.now())
    expect(lockedUntil).toBeLessThanOrEqual(Date.now() + LOCKOUT_DURATION_MS + 100)
    expect(state?.lockoutCycles).toBe(1)
  })

  test("locked accounts cannot log in with valid credentials until the lockout expires", async () => {
    let currentTime = 1_000_000
    const service = new AuthService({ now: () => currentTime })

    for (let i = 0; i < 3; i += 1) {
      const r = await service.login({ username: "alice", password: "wrong" })
      expect(r.ok).toBe(false)
    }

    const locked = await service.login({
      username: "alice",
      password: "wonderland",
    })
    expect(locked.ok).toBe(false)
    if (!locked.ok) {
      expect(locked.error.code).toBe("ACCOUNT_LOCKED")
    }

    currentTime += LOCKOUT_DURATION_MS + 1
    const afterUnlock = await service.login({
      username: "alice",
      password: "wonderland",
    })
    expect(afterUnlock.ok).toBe(true)
  })

  test("lockout message does not leak the remaining lockout duration", async () => {
    const service = new AuthService()
    await service.login({ username: "alice", password: "wrong" })
    await service.login({ username: "alice", password: "wrong" })
    const third = await service.login({ username: "alice", password: "wrong" })
    expect(third.ok).toBe(false)
    if (!third.ok) {
      const message = third.error.message.toLowerCase()
      expect(message).not.toContain("minute")
      expect(message).not.toContain("second")
      expect(message).not.toMatch(/\d/)
    }
  })
})

describe("AuthService.login — 403 ACCOUNT_SUSPENDED", () => {
  test("scenario 7: 3 consecutive lockout cycles suspend the account", async () => {
    let currentTime = 1_000_000
    const service = new AuthService({ now: () => currentTime })

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await service.login({ username: "alice", password: "wrong" })
      await service.login({ username: "alice", password: "wrong" })
      const third = await service.login({ username: "alice", password: "wrong" })
      expect(third.ok).toBe(false)
      if (!third.ok) {
        expect(third.error.code).toBe("ACCOUNT_LOCKED")
      }
      currentTime += LOCKOUT_DURATION_MS + 1
    }

    const afterLockouts = await service.login({
      username: "alice",
      password: "wrong",
    })
    expect(afterLockouts.ok).toBe(false)
    if (!afterLockouts.ok) {
      expect(afterLockouts.error.code).toBe("ACCOUNT_SUSPENDED")
      expect(afterLockouts.error.message.toLowerCase()).toContain("suspended")
    }

    const suspended = service.getState("alice")
    expect(suspended?.isSuspended).toBe(true)
  })

  test("suspended accounts are blocked even with valid credentials", async () => {
    const service = new AuthService()
    service.seedState({ username: "alice", isSuspended: true })
    const result = await service.login({ username: "alice", password: "wonderland" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("ACCOUNT_SUSPENDED")
    }
  })

  test("isLocked is checked BEFORE isSuspended: 3rd attempt of 3rd lockout cycle returns 423", async () => {
    let currentTime = 1_000_000
    const service = new AuthService({ now: () => currentTime })

    for (let cycle = 1; cycle <= 2; cycle += 1) {
      await service.login({ username: "alice", password: "wrong" })
      await service.login({ username: "alice", password: "wrong" })
      const third = await service.login({ username: "alice", password: "wrong" })
      expect(third.ok).toBe(false)
      if (!third.ok) {
        expect(third.error.code).toBe("ACCOUNT_LOCKED")
      }
      currentTime += LOCKOUT_DURATION_MS + 1
    }

    await service.login({ username: "alice", password: "wrong" })
    await service.login({ username: "alice", password: "wrong" })
    const thirdOfThirdCycle = await service.login({
      username: "alice",
      password: "wrong",
    })
    expect(thirdOfThirdCycle.ok).toBe(false)
    if (!thirdOfThirdCycle.ok) {
      expect(thirdOfThirdCycle.error.code).toBe("ACCOUNT_LOCKED")
    }

    const state = service.getState("alice")
    expect(state?.isSuspended).toBe(true)
    expect(state?.isLocked).toBe(true)
  })
})

describe("AuthService.login — 500 INTERNAL_ERROR", () => {
  test("scenario 8: a verify throw becomes INTERNAL_ERROR (network-error path)", async () => {
    const service = new AuthService({
      verify: () => {
        throw new Error("upstream down")
      },
    })
    service.addUser("alice", "wonderland")
    const result = await service.login({ username: "alice", password: "wonderland" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL_ERROR")
    }
  })

  test("scenario 8: 500 message is generic (does not echo the underlying error)", async () => {
    const service = new AuthService({
      verify: () => {
        throw new Error("upstream database connection refused")
      },
    })
    service.addUser("alice", "wonderland")
    const result = await service.login({ username: "alice", password: "wonderland" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message.toLowerCase()).not.toContain("database")
      expect(result.error.message.toLowerCase()).not.toContain("upstream")
    }
  })

  test("scenario 8: after a 500 the user can retry and eventually succeed", async () => {
    let fail = true
    const service = new AuthService({
      verify: (username, password) => {
        if (fail) {
          throw new Error("upstream down")
        }
        return username === "alice" && password === "wonderland"
      },
    })
    service.addUser("alice", "wonderland")

    const first = await service.login({ username: "alice", password: "wonderland" })
    expect(first.ok).toBe(false)
    if (!first.ok) {
      expect(first.error.code).toBe("INTERNAL_ERROR")
    }

    fail = false
    const second = await service.login({ username: "alice", password: "wonderland" })
    expect(second.ok).toBe(true)
  })
})

describe("AuthService.clearAttempts", () => {
  let service: AuthService

  beforeEach(() => {
    service = new AuthService()
  })

  test("resets the attempt counter for a username", async () => {
    await service.login({ username: "alice", password: "wrong" })
    await service.login({ username: "alice", password: "wrong" })
    expect(service.getAttemptCount("alice")).toBe(2)

    const result = await service.clearAttempts({ username: "alice" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ username: "alice", cleared: true })
    }
    expect(service.getAttemptCount("alice")).toBe(0)
  })

  test("returns VALIDATION_ERROR when username is empty", async () => {
    const result = await service.clearAttempts({ username: "" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR")
    }
  })

  test("returns USER_NOT_FOUND (404) for an unknown username", async () => {
    const result = await service.clearAttempts({ username: "ghost" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("USER_NOT_FOUND")
    }
  })

  test("clears a previously locked account (state visible after clear)", async () => {
    const fresh = new AuthService()
    await fresh.login({ username: "alice", password: "wrong" })
    await fresh.login({ username: "alice", password: "wrong" })
    await fresh.login({ username: "alice", password: "wrong" })
    expect(fresh.getState("alice")?.isLocked).toBe(true)

    const result = await fresh.clearAttempts({ username: "alice" })
    expect(result.ok).toBe(true)

    const state = fresh.getState("alice")
    expect(state?.isLocked).toBe(false)
    expect(state?.lockedUntil).toBeNull()
    expect(state?.attemptCount).toBe(0)
  })
})

describe("AuthService state helpers", () => {
  test("getAttemptCount returns 0 for unknown usernames", () => {
    const service = new AuthService()
    expect(service.getAttemptCount("nobody")).toBe(0)
  })

  test("getAttemptCount reflects the current count", async () => {
    const service = new AuthService()
    await service.login({ username: "alice", password: "wrong" })
    expect(service.getAttemptCount("alice")).toBe(1)
    await service.login({ username: "alice", password: "wrong" })
    expect(service.getAttemptCount("alice")).toBe(2)
  })

  test("reset() clears all in-memory state", async () => {
    const service = new AuthService()
    await service.login({ username: "alice", password: "wrong" })
    await service.login({ username: "bob", password: "wrong" })
    expect(service.getAttemptCount("alice")).toBe(1)
    expect(service.getAttemptCount("bob")).toBe(1)

    service.reset()

    expect(service.getAttemptCount("alice")).toBe(0)
    expect(service.getAttemptCount("bob")).toBe(0)
    expect(service.getState("alice")).toBeUndefined()
  })
})

describe("seed helpers (programmatic)", () => {
  test("seedUser adds a new user that can log in", async () => {
    const service = new AuthService()
    seedUser(service, "carol", "secret123")
    const result = await service.login({ username: "carol", password: "secret123" })
    expect(result.ok).toBe(true)
  })

  test("seedFailedAttempts primes the counter to a specific value", () => {
    const service = new AuthService()
    seedFailedAttempts(service, "alice", 2)
    expect(service.getAttemptCount("alice")).toBe(2)
  })

  test("seedLockoutCycle primes the lockout cycle counter", () => {
    const service = new AuthService()
    seedLockoutCycle(service, "alice", 3)
    expect(service.getState("alice")?.lockoutCycles).toBe(3)
  })

  test("seedUser + seedFailedAttempts + seedLockoutCycle sets up scenario 6", async () => {
    const service = new AuthService()
    seedUser(service, "alice", "wonderland")
    seedFailedAttempts(service, "alice", 2)
    const third = await service.login({ username: "alice", password: "wrong" })
    expect(third.ok).toBe(false)
    if (!third.ok) {
      expect(third.error.code).toBe("ACCOUNT_LOCKED")
    }
    expect(service.getState("alice")?.lockoutCycles).toBe(1)
  })

  test("seedLockoutCycle + seedSuspended sets up scenario 7", async () => {
    const service = new AuthService()
    seedUser(service, "alice", "wonderland")
    seedLockoutCycle(service, "alice", 3)
    service.setSuspended("alice", true)
    const result = await service.login({ username: "alice", password: "wonderland" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("ACCOUNT_SUSPENDED")
    }
  })
})
