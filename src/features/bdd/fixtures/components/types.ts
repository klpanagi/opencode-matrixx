/**
 * BDD Contract types for User Login feature.
 * Extracted from login.feature.contract.json annotations:
 *   - @state: SessionState
 *   - @api: POST /api/v1/auth/login
 *   - @ui:route /login
 */

/** Session lifecycle — transitions from new-session-init to authenticated after successful login */
export type SessionState = "new-session-init" | "authenticated";

/** Credentials submitted to POST /api/v1/auth/login */
export interface LoginCredentials {
  email: string;
  password: string;
}

/** Response body from a successful login request */
export interface LoginResponse {
  /** JWT session token */
  token: string;
  /** URL to redirect the user to after login */
  redirect: string;
}

/** Props for the LoginPage component */
export interface LoginPageProps {
  /** Base URL for API requests (defaults to window.location.origin) */
  apiBaseUrl?: string;
  /** Callback fired with the login response on success (before redirect) */
  onLoginSuccess?: (response: LoginResponse) => void;
  /** Callback fired when login fails */
  onLoginError?: (error: Error) => void;
}

/** Props for the WelcomeMessage component */
export interface WelcomeMessageProps {
  /** Authenticated user's email to display in the welcome message */
  email: string;
  /** Optional callback to dismiss the welcome message */
  onDismiss?: () => void;
}
