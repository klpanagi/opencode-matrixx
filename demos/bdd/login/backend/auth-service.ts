import {
  type ClearAttemptsRequest,
  ClearAttemptsRequestSchema,
  type ClearAttemptsResponse,
  Err,
  type LoginError,
  type LoginRequest,
  LoginRequestSchema,
  type LoginResponse,
  Ok,
  type Result,
} from "./types.ts"

export const LOCKOUT_DURATION_MS = 30 * 60 * 1000
const MAX_ATTEMPTS = 3
const MAX_LOCKOUT_CYCLES = 3
const SESSION_DURATION_MS = 60 * 60 * 1000

export type AccountState = {
  username: string
  attemptCount: number
  lockoutCycles: number
  isLocked: boolean
  lockedUntil: number | null
  isSuspended: boolean
}

export type VerifyCredentials = (username: string, password: string) => boolean

export type AuthServiceOptions = {
  credentials?: Record<string, string>
  now?: () => number
  verify?: VerifyCredentials
}

const defaultCredentials: Record<string, string> = {
  alice: "wonderland",
  bob: "builder",
  "alice.bank": "wonderland",
}

const errorMessage = (code: LoginError["code"]): string => {
  switch (code) {
    case "VALIDATION_ERROR":
      return "Please enter both username and password."
    case "INVALID_CREDENTIALS":
      return "Invalid username or password. Please try again."
    case "USER_NOT_FOUND":
      return "No account found for the supplied username."
    case "ACCOUNT_LOCKED":
      return "Your account has been locked due to multiple failed login attempts. Please contact customer support to unlock your account."
    case "ACCOUNT_SUSPENDED":
      return "Your account has been suspended. Please contact the Contact Centre for manual re-enablement."
    case "INTERNAL_ERROR":
      return "An unexpected error occurred. Please try again."
  }
}

const buildError = (code: LoginError["code"]): LoginError => ({
  code,
  message: errorMessage(code),
})

export class AuthService {
  private readonly credentials: Map<string, string>
  private readonly states: Map<string, AccountState>
  private readonly nowFn: () => number
  private readonly verifyFn: VerifyCredentials

  constructor(opts: AuthServiceOptions = {}) {
    this.credentials = new Map(
      Object.entries({ ...defaultCredentials, ...(opts.credentials ?? {}) }),
    )
    this.states = new Map()
    this.nowFn = opts.now ?? Date.now
    this.verifyFn =
      opts.verify ??
      ((username, password) => this.credentials.get(username) === password)
  }

  async login(req: LoginRequest): Promise<Result<LoginResponse, LoginError>> {
    const parsed = LoginRequestSchema.safeParse(req)
    if (!parsed.success) {
      return Err(buildError("VALIDATION_ERROR"))
    }

    try {
      const { username, password } = parsed.data
      const state = this.getOrCreate(username)
      this.maybeExpireLock(state)

      if (state.isLocked) {
        return Err(buildError("ACCOUNT_LOCKED"))
      }
      if (state.isSuspended) {
        return Err(buildError("ACCOUNT_SUSPENDED"))
      }

      const valid = this.verifyFn(username, password)
      if (valid) {
        state.attemptCount = 0
        state.lockoutCycles = 0
        state.isLocked = false
        state.lockedUntil = null
        return Ok(this.buildSuccess(username))
      }

      state.attemptCount += 1
      if (state.attemptCount >= MAX_ATTEMPTS) {
        state.attemptCount = 0
        state.isLocked = true
        state.lockedUntil = this.nowFn() + LOCKOUT_DURATION_MS
        state.lockoutCycles += 1
        if (state.lockoutCycles >= MAX_LOCKOUT_CYCLES) {
          state.isSuspended = true
        }
      }

      if (state.isLocked) {
        return Err(buildError("ACCOUNT_LOCKED"))
      }
      if (state.isSuspended) {
        return Err(buildError("ACCOUNT_SUSPENDED"))
      }
      return Err(buildError("INVALID_CREDENTIALS"))
    } catch (_cause) {
      return Err(buildError("INTERNAL_ERROR"))
    }
  }

  async clearAttempts(
    req: ClearAttemptsRequest,
  ): Promise<Result<ClearAttemptsResponse, LoginError>> {
    const parsed = ClearAttemptsRequestSchema.safeParse(req)
    if (!parsed.success) {
      return Err(buildError("VALIDATION_ERROR"))
    }

    const { username } = parsed.data
    const state = this.states.get(username)
    if (!state) {
      return Err(buildError("USER_NOT_FOUND"))
    }
    state.attemptCount = 0
    state.isLocked = false
    state.lockedUntil = null
    return Ok({ username, cleared: true })
  }

  getAttemptCount(username: string): number {
    return this.states.get(username)?.attemptCount ?? 0
  }

  getState(username: string): AccountState | undefined {
    return this.states.get(username)
  }

  addUser(username: string, password: string): void {
    this.credentials.set(username, password)
  }

  setFailedAttempts(username: string, count: number): void {
    const state = this.getOrCreate(username)
    state.attemptCount = Math.max(0, count)
  }

  setLockoutCycle(username: string, cycles: number): void {
    const state = this.getOrCreate(username)
    state.lockoutCycles = Math.max(0, cycles)
  }

  setSuspended(username: string, suspended: boolean): void {
    const state = this.getOrCreate(username)
    state.isSuspended = suspended
  }

  seedState(state: Partial<AccountState> & { username: string }): void {
    const existing = this.states.get(state.username)
    this.states.set(state.username, {
      username: state.username,
      attemptCount: state.attemptCount ?? existing?.attemptCount ?? 0,
      lockoutCycles: state.lockoutCycles ?? existing?.lockoutCycles ?? 0,
      isLocked: state.isLocked ?? existing?.isLocked ?? false,
      lockedUntil: state.lockedUntil ?? existing?.lockedUntil ?? null,
      isSuspended: state.isSuspended ?? existing?.isSuspended ?? false,
    })
  }

  reset(): void {
    this.states.clear()
  }

  private getOrCreate(username: string): AccountState {
    let state = this.states.get(username)
    if (!state) {
      state = {
        username,
        attemptCount: 0,
        lockoutCycles: 0,
        isLocked: false,
        lockedUntil: null,
        isSuspended: false,
      }
      this.states.set(username, state)
    }
    return state
  }

  private maybeExpireLock(state: AccountState): void {
    if (state.isLocked && state.lockedUntil !== null) {
      if (this.nowFn() >= state.lockedUntil) {
        state.isLocked = false
        state.lockedUntil = null
      }
    }
  }

  private buildSuccess(username: string): LoginResponse {
    const expiresAt = new Date(this.nowFn() + SESSION_DURATION_MS).toISOString()
    return {
      token: `tok_${username}_${expiresAt}`,
      userId: `usr_${username}`,
      expiresAt,
    }
  }
}
