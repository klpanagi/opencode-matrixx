import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { AuthService, LOCKOUT_DURATION_MS } from "./auth-service.ts"
import { createServer, type ServerHandle } from "./server.ts"

const baseUrl = (handle: ServerHandle): string =>
  `http://${handle.hostname}:${handle.port}`

const postJson = async (
  handle: ServerHandle,
  path: string,
  body: unknown,
): Promise<Response> => {
  return fetch(`${baseUrl(handle)}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const readJson = async (res: Response): Promise<unknown> => res.json()

describe("server: 200 successful login", () => {
  let handle: ServerHandle

  beforeEach(async () => {
    handle = await createServer()
  })

  afterEach(async () => {
    await handle.stop()
  })

  test("POST /api/v1/auth/login returns 200 with token, userId, expiresAt", async () => {
    const res = await postJson(handle, "/api/v1/auth/login", {
      username: "alice",
      password: "wonderland",
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/json")
    const body = (await readJson(res)) as {
      token: string
      userId: string
      expiresAt: string
    }
    expect(body.token).toStartWith("tok_alice_")
    expect(body.userId).toBe("usr_alice")
    expect(typeof body.expiresAt).toBe("string")
    expect(() => new Date(body.expiresAt).toISOString()).not.toThrow()
  })

  test("scenario 1: successful login body has no extra fields", async () => {
    const res = await postJson(handle, "/api/v1/auth/login", {
      username: "alice",
      password: "wonderland",
    })
    const body = (await readJson(res)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(["expiresAt", "token", "userId"])
  })

  test("scenario 2: migrated user logs in with non-email username", async () => {
    const res = await postJson(handle, "/api/v1/auth/login", {
      username: "alice.bank",
      password: "wonderland",
    })
    expect(res.status).toBe(200)
    const body = (await readJson(res)) as { userId: string }
    expect(body.userId).toBe("usr_alice.bank")
  })
})

describe("server: 400 VALIDATION_ERROR", () => {
  let handle: ServerHandle

  beforeEach(async () => {
    handle = await createServer()
  })

  afterEach(async () => {
    await handle.stop()
  })

  test("scenario 4: empty fields return 400 with VALIDATION_ERROR code", async () => {
    const res = await postJson(handle, "/api/v1/auth/login", {
      username: "",
      password: "",
    })
    expect(res.status).toBe(400)
    const body = (await readJson(res)) as { code: string; message: string }
    expect(body.code).toBe("VALIDATION_ERROR")
    expect(typeof body.message).toBe("string")
  })

  test("scenario 4: malformed JSON body returns 400 with VALIDATION_ERROR", async () => {
    const res = await fetch(`${baseUrl(handle)}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    })
    expect(res.status).toBe(400)
    const body = (await readJson(res)) as { code: string }
    expect(body.code).toBe("VALIDATION_ERROR")
  })

  test("clearAttempts with empty username returns 400 VALIDATION_ERROR", async () => {
    const res = await postJson(handle, "/api/v1/auth/attempts/clear", {
      username: "",
    })
    expect(res.status).toBe(400)
    const body = (await readJson(res)) as { code: string }
    expect(body.code).toBe("VALIDATION_ERROR")
  })
})

describe("server: 401 INVALID_CREDENTIALS", () => {
  let handle: ServerHandle

  beforeEach(async () => {
    handle = await createServer()
  })

  afterEach(async () => {
    await handle.stop()
  })

  test("scenario 5: wrong password returns 401 INVALID_CREDENTIALS", async () => {
    const res = await postJson(handle, "/api/v1/auth/login", {
      username: "alice",
      password: "wrong",
    })
    expect(res.status).toBe(401)
    const body = (await readJson(res)) as { code: string; message: string }
    expect(body.code).toBe("INVALID_CREDENTIALS")
    const message = body.message.toLowerCase()
    expect(message).not.toContain("attempt")
    expect(message).not.toContain("lock")
    expect(message).not.toMatch(/\d/)
  })

  test("scenario 5: unknown user also returns 401 (no USER_NOT_FOUND disclosure)", async () => {
    const res = await postJson(handle, "/api/v1/auth/login", {
      username: "ghost",
      password: "x",
    })
    expect(res.status).toBe(401)
    const body = (await readJson(res)) as { code: string }
    expect(body.code).toBe("INVALID_CREDENTIALS")
  })
})

describe("server: 423 ACCOUNT_LOCKED", () => {
  let handle: ServerHandle

  beforeEach(async () => {
    handle = await createServer()
  })

  afterEach(async () => {
    await handle.stop()
  })

  test("scenario 6: 3rd consecutive failure returns 423 ACCOUNT_LOCKED", async () => {
    for (let i = 0; i < 2; i += 1) {
      const r = await postJson(handle, "/api/v1/auth/login", {
        username: "alice",
        password: "wrong",
      })
      expect(r.status).toBe(401)
    }
    const locked = await postJson(handle, "/api/v1/auth/login", {
      username: "alice",
      password: "wrong",
    })
    expect(locked.status).toBe(423)
    const body = (await readJson(locked)) as { code: string; message: string }
    expect(body.code).toBe("ACCOUNT_LOCKED")
  })

  test("423 message does not leak the remaining lockout duration", async () => {
    for (let i = 0; i < 3; i += 1) {
      await postJson(handle, "/api/v1/auth/login", {
        username: "bob",
        password: "wrong",
      })
    }
    const res = await postJson(handle, "/api/v1/auth/login", {
      username: "bob",
      password: "wrong",
    })
    expect(res.status).toBe(423)
    const body = (await readJson(res)) as { message: string }
    const message = body.message.toLowerCase()
    expect(message).not.toContain("minute")
    expect(message).not.toContain("second")
    expect(message).not.toMatch(/\d/)
  })

  test("423 with valid credentials still blocks login (cannot bypass lockout)", async () => {
    for (let i = 0; i < 3; i += 1) {
      await postJson(handle, "/api/v1/auth/login", {
        username: "alice",
        password: "wrong",
      })
    }
    const res = await postJson(handle, "/api/v1/auth/login", {
      username: "alice",
      password: "wonderland",
    })
    expect(res.status).toBe(423)
  })
})

describe("server: 403 ACCOUNT_SUSPENDED", () => {
  let handle: ServerHandle

  beforeEach(async () => {
    handle = await createServer()
  })

  afterEach(async () => {
    await handle.stop()
  })

  test("scenario 7: suspended account returns 403 ACCOUNT_SUSPENDED", async () => {
    const seed = await postJson(handle, "/__test__/seed", {
      state: { username: "alice", isSuspended: true },
    })
    expect(seed.status).toBe(200)

    const res = await postJson(handle, "/api/v1/auth/login", {
      username: "alice",
      password: "wonderland",
    })
    expect(res.status).toBe(403)
    const body = (await readJson(res)) as { code: string; message: string }
    expect(body.code).toBe("ACCOUNT_SUSPENDED")
    expect(body.message.toLowerCase()).toContain("suspended")
  })

  test("3 consecutive lockout cycles suspend the account (403)", async () => {
    let currentTime = 1_000_000
    const service = new AuthService({ now: () => currentTime })
    const custom = await createServer({ service })
    try {
      for (let cycle = 1; cycle <= 3; cycle += 1) {
        for (let i = 0; i < 3; i += 1) {
          const r = await postJson(custom, "/api/v1/auth/login", {
            username: "alice",
            password: "wrong",
          })
          if (i < 2) {
            expect(r.status).toBe(401)
          } else {
            expect(r.status).toBe(423)
          }
        }
        currentTime += LOCKOUT_DURATION_MS + 1
      }

      const res = await postJson(custom, "/api/v1/auth/login", {
        username: "alice",
        password: "wrong",
      })
      expect(res.status).toBe(403)
      const body = (await readJson(res)) as { code: string }
      expect(body.code).toBe("ACCOUNT_SUSPENDED")
    } finally {
      await custom.stop()
    }
  })
})

describe("server: 500 INTERNAL_ERROR", () => {
  test("scenario 8: a verify throw returns 500 INTERNAL_ERROR", async () => {
    const service = new AuthService({
      verify: () => {
        throw new Error("upstream down")
      },
    })
    service.addUser("alice", "wonderland")
    const handle = await createServer({ service })
    try {
      const res = await postJson(handle, "/api/v1/auth/login", {
        username: "alice",
        password: "wonderland",
      })
      expect(res.status).toBe(500)
      const body = (await readJson(res)) as { code: string; message: string }
      expect(body.code).toBe("INTERNAL_ERROR")
      expect(body.message.toLowerCase()).not.toContain("upstream")
    } finally {
      await handle.stop()
    }
  })
})

describe("server: clearAttempts endpoint", () => {
  let handle: ServerHandle

  beforeEach(async () => {
    handle = await createServer()
  })

  afterEach(async () => {
    await handle.stop()
  })

  test("returns 200 and resets the counter for a known user", async () => {
    await postJson(handle, "/api/v1/auth/login", { username: "alice", password: "wrong" })
    await postJson(handle, "/api/v1/auth/login", { username: "alice", password: "wrong" })

    const res = await postJson(handle, "/api/v1/auth/attempts/clear", {
      username: "alice",
    })
    expect(res.status).toBe(200)
    const body = (await readJson(res)) as { username: string; cleared: boolean }
    expect(body).toEqual({ username: "alice", cleared: true })

    const after = await postJson(handle, "/api/v1/auth/login", {
      username: "alice",
      password: "wrong",
    })
    expect(after.status).toBe(401)
  })

  test("returns 404 USER_NOT_FOUND for an unknown username", async () => {
    const res = await postJson(handle, "/api/v1/auth/attempts/clear", {
      username: "ghost",
    })
    expect(res.status).toBe(404)
    const body = (await readJson(res)) as { code: string }
    expect(body.code).toBe("USER_NOT_FOUND")
  })
})

describe("server: test helpers and routing", () => {
  let handle: ServerHandle

  beforeEach(async () => {
    handle = await createServer()
  })

  afterEach(async () => {
    await handle.stop()
  })

  test("POST /__test__/seed sets the documented state fields", async () => {
    const res = await postJson(handle, "/__test__/seed", {
      state: {
        username: "alice",
        attemptCount: 2,
        isLocked: false,
        isSuspended: false,
      },
    })
    expect(res.status).toBe(200)
    const body = (await readJson(res)) as { seeded: boolean; username: string }
    expect(body).toEqual({ seeded: true, username: "alice" })
  })

  test("POST /__test__/seed rejects invalid body with 400", async () => {
    const res = await postJson(handle, "/__test__/seed", {})
    expect(res.status).toBe(400)
  })

  test("POST /__test__/reset clears all in-memory state", async () => {
    await postJson(handle, "/api/v1/auth/login", { username: "alice", password: "wrong" })
    await postJson(handle, "/api/v1/auth/login", { username: "alice", password: "wrong" })
    await postJson(handle, "/api/v1/auth/login", { username: "alice", password: "wrong" })
    const lockedBefore = await postJson(handle, "/api/v1/auth/login", {
      username: "alice",
      password: "wonderland",
    })
    expect(lockedBefore.status).toBe(423)

    const reset = await postJson(handle, "/__test__/reset", {})
    expect(reset.status).toBe(200)

    const after = await postJson(handle, "/api/v1/auth/login", {
      username: "alice",
      password: "wonderland",
    })
    expect(after.status).toBe(200)
  })

  test("GET /health returns 200", async () => {
    const res = await fetch(`${baseUrl(handle)}/health`)
    expect(res.status).toBe(200)
    const body = (await readJson(res)) as { status: string }
    expect(body.status).toBe("ok")
  })

  test("unknown route returns 404 with NOT_FOUND code", async () => {
    const res = await fetch(`${baseUrl(handle)}/api/v1/does-not-exist`)
    expect(res.status).toBe(404)
    const body = (await readJson(res)) as { code: string }
    expect(body.code).toBe("NOT_FOUND")
  })

  test("GET on a POST-only endpoint returns 404", async () => {
    const res = await fetch(`${baseUrl(handle)}/api/v1/auth/login`)
    expect(res.status).toBe(404)
  })
})

describe("server: configuration", () => {
  test("createServer binds to 127.0.0.1 by default", async () => {
    const handle = await createServer()
    try {
      expect(handle.hostname).toBe("127.0.0.1")
      const res = await fetch(`${baseUrl(handle)}/health`)
      expect(res.status).toBe(200)
    } finally {
      await handle.stop()
    }
  })

  test("createServer uses port 0 (dynamic) by default", async () => {
    const handle = await createServer()
    try {
      expect(handle.port).toBeGreaterThan(0)
    } finally {
      await handle.stop()
    }
  })

  test("createServer honours explicit hostname", async () => {
    const handle = await createServer({ port: 0, hostname: "127.0.0.1" })
    try {
      expect(handle.hostname).toBe("127.0.0.1")
      const res = await fetch(`${baseUrl(handle)}/health`)
      expect(res.status).toBe(200)
    } finally {
      await handle.stop()
    }
  })
})

