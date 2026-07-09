import { z } from "zod"
import type { AuthService } from "./auth-service.ts"

/**
 * Test seed helpers that mirror the Gherkin `Given` clauses in
 * `1001_username_password.feature`. The programmatic helpers
 * (`seedUser`, `seedFailedAttempts`, `seedLockoutCycle`) operate
 * directly on an `AuthService` instance for unit tests; the
 * HTTP-based helpers (`seedAuthState`, `resetAuthState`) are
 * provided for integration / e2e tests against a running server.
 */

export const SeedStateSchema = z.object({
  username: z.string().min(1),
  attemptCount: z.number().int().nonnegative().optional(),
  lockoutCycles: z.number().int().nonnegative().optional(),
  isLocked: z.boolean().optional(),
  lockedUntil: z.number().int().nullable().optional(),
  isSuspended: z.boolean().optional(),
})
export type SeedState = z.infer<typeof SeedStateSchema>

export const SeedPayloadSchema = z.object({ state: SeedStateSchema })
export type SeedPayload = z.infer<typeof SeedPayloadSchema>

export const seedUser = (
  service: AuthService,
  username: string,
  password: string,
): void => {
  service.addUser(username, password)
}

export const seedFailedAttempts = (
  service: AuthService,
  username: string,
  count: number,
): void => {
  service.setFailedAttempts(username, count)
}

export const seedLockoutCycle = (
  service: AuthService,
  username: string,
  cycles: number,
): void => {
  service.setLockoutCycle(username, cycles)
}

export type SeedAuthStateOptions = {
  baseUrl?: string
  fetchImpl?: typeof fetch
}

const defaultBaseUrl = "http://127.0.0.1:3001"

export const seedAuthState = async (
  state: SeedState,
  opts: SeedAuthStateOptions = {},
): Promise<void> => {
  const baseUrl = opts.baseUrl ?? defaultBaseUrl
  const fetchImpl = opts.fetchImpl ?? fetch
  const res = await fetchImpl(`${baseUrl}/__test__/seed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state } satisfies SeedPayload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`seedAuthState failed: ${res.status} ${text}`)
  }
}

export const resetAuthState = async (
  opts: SeedAuthStateOptions = {},
): Promise<void> => {
  const baseUrl = opts.baseUrl ?? defaultBaseUrl
  const fetchImpl = opts.fetchImpl ?? fetch
  const res = await fetchImpl(`${baseUrl}/__test__/reset`, {
    method: "POST",
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`resetAuthState failed: ${res.status} ${text}`)
  }
}
