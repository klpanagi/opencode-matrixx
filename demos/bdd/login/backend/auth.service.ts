// ---------------------------------------------------------------------------
// Auth Service — BDD-generated from 1001_username_password.feature.contract.json
//
// Endpoints:
//   POST /auth/login   — Authenticate with username & password
//   GET  /auth/session  — Validate an existing session token
//
// Responses:
//   200 login success
//   401 invalid credentials
//   423 account locked
//   403 account suspended
//   network_error authentication error
// ---------------------------------------------------------------------------

import { z } from "zod";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const LoginRequest = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const SessionRequest = z.object({
  sessionToken: z.string().min(1, "Session token is required"),
});
export type SessionRequest = z.infer<typeof SessionRequest>;

// ---------------------------------------------------------------------------
// POST /auth/login — Response schemas
// ---------------------------------------------------------------------------

export const LoginSuccessResponse = z.object({
  status: z.literal(200),
  success: z.literal(true),
  sessionToken: z.string(),
  message: z.string(),
});
export type LoginSuccessResponse = z.infer<typeof LoginSuccessResponse>;

export const InvalidCredentialsResponse = z.object({
  status: z.literal(401),
  success: z.literal(false),
  error: z.literal("invalid_credentials"),
  message: z.string(),
});
export type InvalidCredentialsResponse = z.infer<typeof InvalidCredentialsResponse>;

export const AccountLockedResponse = z.object({
  status: z.literal(423),
  success: z.literal(false),
  error: z.literal("account_locked"),
  lockedUntil: z.string().datetime(),
  message: z.string(),
});
export type AccountLockedResponse = z.infer<typeof AccountLockedResponse>;

export const AccountSuspendedResponse = z.object({
  status: z.literal(403),
  success: z.literal(false),
  error: z.literal("account_suspended"),
  message: z.string(),
});
export type AccountSuspendedResponse = z.infer<typeof AccountSuspendedResponse>;

export const NetworkAuthErrorResponse = z.object({
  status: z.literal(0),
  success: z.literal(false),
  error: z.literal("network_error"),
  message: z.string(),
  retryable: z.literal(true),
});
export type NetworkAuthErrorResponse = z.infer<typeof NetworkAuthErrorResponse>;

/** Discriminated union of every possible POST /auth/login response. */
export const LoginResponse = z.discriminatedUnion("status", [
  LoginSuccessResponse,
  InvalidCredentialsResponse,
  AccountLockedResponse,
  AccountSuspendedResponse,
  NetworkAuthErrorResponse,
]);
export type LoginResponse = z.infer<typeof LoginResponse>;

// ---------------------------------------------------------------------------
// GET /auth/session — Response schemas
// ---------------------------------------------------------------------------

export const SessionValidResponse = z.object({
  status: z.literal(200),
  valid: z.literal(true),
  sessionToken: z.string(),
});
export type SessionValidResponse = z.infer<typeof SessionValidResponse>;

export const SessionExpiredResponse = z.object({
  status: z.literal(401),
  valid: z.literal(false),
  error: z.literal("session_expired"),
});
export type SessionExpiredResponse = z.infer<typeof SessionExpiredResponse>;

/** Discriminated union of every possible GET /auth/session response. */
export const SessionResponse = z.discriminatedUnion("status", [
  SessionValidResponse,
  SessionExpiredResponse,
]);
export type SessionResponse = z.infer<typeof SessionResponse>;

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type AuthErrorCode =
  | "invalid_credentials"
  | "account_locked"
  | "account_suspended"
  | "network_error";

export class AuthServiceError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Authenticate a user with username and password.
 *
 * On success returns a session token.  On failure returns a typed error
 * explaining whether credentials are wrong, the account is locked, the
 * account is suspended, or a network error occurred.
 */
export async function login(data: LoginRequest): Promise<LoginResponse> {
  const parsed = LoginRequest.parse(data);

  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });

    const json: unknown = await response.json();
    return LoginResponse.parse(json);
  } catch (err) {
    // Non-HTTP errors (network down, DNS failure, etc.) are surfaced as
    // typed network errors so callers can always work with a union member.
    if (err instanceof z.ZodError) throw err;
    return {
      status: 0,
      success: false,
      error: "network_error",
      message:
        err instanceof Error
          ? err.message
          : "An unexpected authentication error occurred. Please try again.",
      retryable: true,
    };
  }
}

/**
 * Check whether an existing session token is still valid.
 *
 * Returns 200 + `{ valid: true }` when the token is active, or 401 +
 * `{ valid: false, error: "session_expired" }` when it has expired.
 */
export async function checkSession(data: SessionRequest): Promise<SessionResponse> {
  const parsed = SessionRequest.parse(data);

  try {
    const response = await fetch("/auth/session", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parsed.sessionToken}`,
      },
    });

    const json: unknown = await response.json();
    return SessionResponse.parse(json);
  } catch (err) {
    if (err instanceof z.ZodError) throw err;
    return {
      status: 401,
      valid: false,
      error: "session_expired",
    };
  }
}
