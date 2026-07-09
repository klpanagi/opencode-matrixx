import { z } from "zod"

/** Request/response schemas and the project-wide `Result<T, E>` discriminated union. */

export const LoginRequestSchema = z.object({
  username: z.string().min(1, "username must not be empty"),
  password: z.string().min(1, "password must not be empty"),
})
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const ClearAttemptsRequestSchema = z.object({
  username: z.string().min(1, "username must not be empty"),
})
export type ClearAttemptsRequest = z.infer<typeof ClearAttemptsRequestSchema>

export const LoginResponseSchema = z.object({
  token: z.string(),
  userId: z.string(),
  expiresAt: z.string(),
})
export type LoginResponse = z.infer<typeof LoginResponseSchema>

export const ClearAttemptsResponseSchema = z.object({
  username: z.string(),
  cleared: z.boolean(),
})
export type ClearAttemptsResponse = z.infer<typeof ClearAttemptsResponseSchema>

/** HTTP status mapping for every business-error code (see `ERROR_STATUS` table). */
export const LoginErrorCodeSchema = z.enum([
  "VALIDATION_ERROR", // 400
  "INVALID_CREDENTIALS", // 401
  "USER_NOT_FOUND", // 404
  "ACCOUNT_LOCKED", // 423
  "ACCOUNT_SUSPENDED", // 403
  "INTERNAL_ERROR", // 500
])
export type LoginErrorCode = z.infer<typeof LoginErrorCodeSchema>

export const LoginErrorSchema = z.object({
  code: LoginErrorCodeSchema,
  message: z.string(),
})
export type LoginError = z.infer<typeof LoginErrorSchema>

export const ERROR_STATUS: Record<LoginErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  USER_NOT_FOUND: 404,
  ACCOUNT_LOCKED: 423,
  ACCOUNT_SUSPENDED: 403,
  INTERNAL_ERROR: 500,
}

/** `{ ok: true, value: T } | { ok: false, error: E }`. Business failures are returned, never thrown. */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error })
