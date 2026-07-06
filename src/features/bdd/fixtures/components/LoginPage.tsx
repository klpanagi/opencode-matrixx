import React, { type FormEvent, useState } from "react";
import type {
  LoginCredentials,
  LoginResponse,
  LoginPageProps,
  SessionState,
} from "./types";
import { WelcomeMessage } from "./WelcomeMessage";

/* ------------------------------------------------------------------ */
/*  Inline styles — zero external CSS dependencies                    */
/* ------------------------------------------------------------------ */
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 400,
    margin: "0 auto",
    padding: 24,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  heading: {
    fontSize: 24,
    fontWeight: 600,
    marginBottom: 20,
    color: "#111827",
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    marginBottom: 4,
    fontWeight: 500,
    fontSize: 14,
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 16,
    lineHeight: 1.5,
    boxSizing: "border-box",
    outline: "none",
    transition: "border-color 0.15s ease",
  },
  button: {
    width: "100%",
    padding: "10px 16px",
    backgroundColor: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    lineHeight: 1.5,
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
    marginTop: 8,
    padding: "8px 12px",
    backgroundColor: "#fef2f2",
    borderRadius: 6,
    border: "1px solid #fecaca",
  },
};

/**
 * LoginPage — Login form component for the User Login feature.
 *
 * Route:  /login   (from @ui:route annotation)
 * API:    POST /api/v1/auth/login  (from @api annotation)
 * State:  SessionState transitions new-session-init → authenticated
 *
 * data-testid attributes (from @ui annotations):
 *   - login-form-component    (on form container)
 *   - login-submit-button     (on submit button)
 */
export function LoginPage({
  apiBaseUrl,
  onLoginSuccess,
  onLoginError,
}: LoginPageProps) {
  /* ---- form fields ---- */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  /* ---- session & submission state ---- */
  const [sessionState, setSessionState] = useState<SessionState>(
    "new-session-init",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(
    null,
  );

  /* ---- handlers ---- */

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const baseUrl = apiBaseUrl || window.location.origin;
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
        } satisfies LoginCredentials),
      });

      if (!res.ok) {
        throw new Error(`Login failed (${res.status})`);
      }

      const data: LoginResponse = await res.json();

      /* SessionState: new-session-init → authenticated */
      setSessionState("authenticated");
      setLoginResponse(data);
      onLoginSuccess?.(data);

      /* Redirection to dashboard per contract */
      if (data.redirect) {
        window.location.href = data.redirect;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
      onLoginError?.(err instanceof Error ? err : new Error(message));
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- render ---- */

  /* Post-login: show welcome message (captured before redirect) */
  if (sessionState === "authenticated" && loginResponse) {
    return <WelcomeMessage email={email} />;
  }

  return (
    <div data-testid="login-form-component" style={styles.container}>
      <h1 style={styles.heading}>Sign In</h1>

      <form onSubmit={handleSubmit} noValidate>
        {/* --- Email field (credential_input step) --- */}
        <div style={styles.fieldGroup}>
          <label htmlFor="login-email" style={styles.label}>
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            style={styles.input}
          />
        </div>

        {/* --- Password field (credential_input step) --- */}
        <div style={styles.fieldGroup}>
          <label htmlFor="login-password" style={styles.label}>
            Password
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            style={styles.input}
          />
        </div>

        {/* --- Error feedback --- */}
        {error && (
          <div role="alert" style={styles.error}>
            {error}
          </div>
        )}

        {/* --- Submit button (@ui:testid button=login-submit-button) --- */}
        <button
          type="submit"
          data-testid="login-submit-button"
          disabled={submitting}
          style={{
            ...styles.button,
            ...(submitting ? styles.buttonDisabled : {}),
          }}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
