import React from "react"
import type { LoginPageProps, LoginBannerProps, LoginError } from "./LoginTypes"
import { UI_STRINGS, TEST_IDS } from "./LoginConstants"

export function LoginBanner({ message, type, testId }: LoginBannerProps) {
  const styles: Record<string, string> = {
    error: "background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;",
    success: "background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;",
    warning: "background: #fffbeb; color: #92400e; border: 1px solid #fde68a;",
  }

  return (
    <div
      data-testid={testId}
      role="alert"
      style={{
        padding: "12px 16px",
        borderRadius: "8px",
        fontSize: "14px",
        lineHeight: "1.5",
        marginBottom: "16px",
        ...Object.fromEntries(
          styles[type]
            .split(";")
            .filter(Boolean)
            .map((s) => s.split(":").map((p) => p.trim()))
        ),
      }}
    >
      {message}
    </div>
  )
}

export function LoginPage({ callbacks, quickLoginExpired }: LoginPageProps) {
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<LoginError | null>(null)
  const [success, setSuccess] = React.useState(false)
  const [isAccountLocked, setIsAccountLocked] = React.useState(false)
  const [isAccountSuspended, setIsAccountSuspended] = React.useState(false)

  const isButtonDisabled = isSubmitting || isAccountLocked || isAccountSuspended

  const getErrorMessage = (err: LoginError): string => {
    switch (err) {
      case "empty_fields":
        return UI_STRINGS.message.empty_fields
      case "invalid_credentials":
        return UI_STRINGS.message.invalid_credentials
      case "account_locked":
        return UI_STRINGS.message.account_locked
      case "account_suspended":
        return UI_STRINGS.message.account_locked
      case "network_error":
        return UI_STRINGS.message.invalid_credentials
      case "quick_login_expired":
        return UI_STRINGS.message.quick_login_expired
      default:
        return ""
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!username.trim() || !password.trim()) {
      setError("empty_fields")
      return
    }

    setIsSubmitting(true)
    try {
      const result = await callbacks.onLogin(username, password)
      if (result.success) {
        setSuccess(true)
        setTimeout(() => callbacks.onNavigateHome(), 1000)
      } else {
        const err = result.error
        setError(err)
        if (err === "account_locked") setIsAccountLocked(true)
        if (err === "account_suspended") setIsAccountSuspended(true)
      }
    } catch {
      setError("network_error")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBiometric = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await callbacks.onBiometricLogin()
      if (result.success) {
        setSuccess(true)
        setTimeout(() => callbacks.onNavigateHome(), 1000)
      } else {
        setError(result.error)
      }
    } catch {
      setError("network_error")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        fontFamily:
          "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "20px",
          padding: "40px 32px",
          boxShadow:
            "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: "24px",
              color: "white",
              fontWeight: 700,
              letterSpacing: "-1px",
            }}
          >
            B
          </div>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#f8fafc",
              margin: 0,
              letterSpacing: "-0.5px",
            }}
          >
            Welcome back
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "#94a3b8",
              margin: "8px 0 0",
            }}
          >
            Sign in to your account
          </p>
        </div>

        {quickLoginExpired && (
          <LoginBanner
            message={UI_STRINGS.message.quick_login_expired}
            type="warning"
            testId={TEST_IDS.lockout_banner}
          />
        )}

        {error && (
          <LoginBanner
            message={getErrorMessage(error)}
            type={
              error === "account_locked" || error === "account_suspended"
                ? "error"
                : "error"
            }
            testId={
              error === "account_locked" || error === "account_suspended"
                ? TEST_IDS.lockout_banner
                : TEST_IDS.error_message
            }
          />
        )}

        {success && (
          <LoginBanner
            message={UI_STRINGS.message.login_successful}
            type="success"
            testId={TEST_IDS.success_message}
          />
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="username"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: "#cbd5e1",
                marginBottom: "6px",
                letterSpacing: "0.3px",
              }}
            >
              Username
            </label>
            <input
              id="username"
              data-testid={TEST_IDS.username_field}
              type="text"
              autoComplete="username"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setError(null)
              }}
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "10px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                background: "rgba(255, 255, 255, 0.05)",
                color: "#f8fafc",
                fontSize: "15px",
                outline: "none",
                transition: "border-color 0.2s, box-shadow 0.2s",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: "#cbd5e1",
                marginBottom: "6px",
                letterSpacing: "0.3px",
              }}
            >
              Password
            </label>
            <input
              id="password"
              data-testid={TEST_IDS.password_field}
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "10px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                background: "rgba(255, 255, 255, 0.05)",
                color: "#f8fafc",
                fontSize: "15px",
                outline: "none",
                transition: "border-color 0.2s, box-shadow 0.2s",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            data-testid={TEST_IDS.sign_in_button}
            disabled={isButtonDisabled}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "10px",
              border: "none",
              background: isButtonDisabled
                ? "rgba(59, 130, 246, 0.4)"
                : "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
              color: isButtonDisabled ? "rgba(255,255,255,0.5)" : "white",
              fontSize: "15px",
              fontWeight: 600,
              cursor: isButtonDisabled ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              letterSpacing: "0.2px",
              marginBottom: "16px",
            }}
          >
            {isSubmitting
              ? UI_STRINGS.button.signing_in
              : UI_STRINGS.button.sign_in}
          </button>
        </form>

        <div style={{ textAlign: "center" }}>
          <button
            type="button"
            data-testid={TEST_IDS.biometric_shortcut_button}
            onClick={handleBiometric}
            disabled={isSubmitting}
            style={{
              background: "none",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#94a3b8",
              fontSize: "14px",
              padding: "10px 20px",
              borderRadius: "10px",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 10V6a4 4 0 0 0-8 0v4" />
              <path d="M18 14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2" />
              <circle cx="12" cy="16" r="2" />
            </svg>
            Use biometrics
          </button>
        </div>

        <div
          style={{
            marginTop: "32px",
            textAlign: "center",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          <span>Protected by bank-grade encryption</span>
        </div>
      </div>
    </div>
  )
}
