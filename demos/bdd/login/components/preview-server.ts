const PORT = Number(process.env.PREVIEW_PORT) || 4000

const MOCK_RESPONSES: Record<string, { status: number; body: unknown }> = {
  "POST /auth/login": {
    status: 200,
    body: { success: true, token: "mock-jwt-token-xxx" },
  },
  "GET /auth/session": {
    status: 200,
    body: { active: true, expiresAt: new Date(Date.now() + 3600000).toISOString() },
  },
}

function handleApi(method: string, path: string): Response {
  const key = `${method} ${path}`
  const mock = MOCK_RESPONSES[key]
  if (mock) {
    return Response.json(mock.body, { status: mock.status })
  }
  return Response.json({ error: "Not found" }, { status: 404 })
}

function buildComponentBundle(): string {
  const entry = `
import React, { createElement } from "react"
import { createRoot } from "react-dom/client"

if (typeof window !== "undefined") { window.React = React }


const UI_STRINGS = {
  button: { sign_in: "Sign in", signing_in: "Signing in..." },
  message: {
    login_successful: "Login successful!",
    empty_fields: "Please enter both username and password.",
    invalid_credentials: "Invalid username or password. Please try again.",
    account_locked: "Your account has been locked due to multiple failed login attempts. Please contact customer support to unlock your account.",
    quick_login_expired: "Quick Login Expired. For your security, please sign in again with your email and password.",
  },
}
const TEST_IDS = {
  username_field: "username_field",
  password_field: "password_field",
  sign_in_button: "sign_in_button",
  biometric_shortcut_button: "biometric_shortcut_button",
  error_message: "error_message",
  success_message: "success_message",
  lockout_banner: "lockout_banner",
}

function Banner({ message, type, testId }) {
  const colors = {
    error: { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" },
    success: { bg: "#f0fdf4", fg: "#166534", border: "#bbf7d0" },
    warning: { bg: "#fffbeb", fg: "#92400e", border: "#fde68a" },
  }
  const c = colors[type] || colors.error
  return createElement("div", {
    "data-testid": testId,
    role: "alert",
    style: { padding: "12px 16px", borderRadius: "8px", fontSize: "14px", lineHeight: "1.5", marginBottom: "16px", background: c.bg, color: c.fg, border: "1px solid " + c.border },
  }, message)
}

function LoginPage() {
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [success, setSuccess] = React.useState(false)
  const [quickExpired, setQuickExpired] = React.useState(false)

  const errorMessages = {
    empty_fields: UI_STRINGS.message.empty_fields,
    invalid_credentials: UI_STRINGS.message.invalid_credentials,
    account_locked: UI_STRINGS.message.account_locked,
    network_error: UI_STRINGS.message.invalid_credentials,
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (!username.trim() || !password.trim()) {
      setError("empty_fields")
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        setSuccess(true)
        setTimeout(() => { window.location.href = "/home" }, 1200)
      } else {
        setError("invalid_credentials")
      }
    } catch {
      setError("network_error")
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputStyle = {
    width: "100%", padding: "12px 16px", borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
    color: "#f8fafc", fontSize: "15px", outline: "none", boxSizing: "border-box",
  }

  return createElement("div", {
    style: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", fontFamily: "'DM Sans', -apple-system, sans-serif", padding: "24px" }
  },
    createElement("div", {
      style: { width: "100%", maxWidth: "400px", background: "rgba(255,255,255,0.03)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px", padding: "40px 32px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }
    },
      createElement("div", { style: { textAlign: "center", marginBottom: "32px" } },
        createElement("div", { style: { width: "56px", height: "56px", borderRadius: "16px", background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "white", fontWeight: 700, fontSize: "24px" } }, "B"),
        createElement("h1", { style: { fontSize: "24px", fontWeight: 700, color: "#f8fafc", margin: 0 } }, "Welcome back"),
        createElement("p", { style: { fontSize: "14px", color: "#94a3b8", margin: "8px 0 0" } }, "Sign in to your account"),
      ),
      error && createElement(Banner, { message: errorMessages[error] || error, type: "error", testId: TEST_IDS.error_message }),
      success && createElement(Banner, { message: UI_STRINGS.message.login_successful, type: "success", testId: TEST_IDS.success_message }),
      createElement("form", { onSubmit: handleSubmit },
        createElement("div", { style: { marginBottom: "20px" } },
          createElement("label", { htmlFor: "username", style: { display: "block", fontSize: "13px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" } }, "Username"),
          createElement("input", { id: "username", "data-testid": TEST_IDS.username_field, type: "text", autoComplete: "username", placeholder: "Enter your username", value: username, onChange: (e) => { setUsername(e.target.value); setError(null) }, disabled: isSubmitting, style: inputStyle }),
        ),
        createElement("div", { style: { marginBottom: "24px" } },
          createElement("label", { htmlFor: "password", style: { display: "block", fontSize: "13px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" } }, "Password"),
          createElement("input", { id: "password", "data-testid": TEST_IDS.password_field, type: "password", autoComplete: "current-password", placeholder: "Enter your password", value: password, onChange: (e) => { setPassword(e.target.value); setError(null) }, disabled: isSubmitting, style: inputStyle }),
        ),
        createElement("button", {
          type: "submit",
          "data-testid": TEST_IDS.sign_in_button,
          disabled: isSubmitting,
          style: { width: "100%", padding: "14px", borderRadius: "10px", border: "none", background: isSubmitting ? "rgba(59,130,246,0.4)" : "linear-gradient(135deg, #3b82f6, #6366f1)", color: isSubmitting ? "rgba(255,255,255,0.5)" : "white", fontSize: "15px", fontWeight: 600, cursor: isSubmitting ? "not-allowed" : "pointer", marginBottom: "16px" },
        }, isSubmitting ? UI_STRINGS.button.signing_in : UI_STRINGS.button.sign_in),
      ),
      createElement("div", { style: { textAlign: "center" } },
        createElement("button", {
          type: "button",
          "data-testid": TEST_IDS.biometric_shortcut_button,
          style: { background: "none", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: "14px", padding: "10px 20px", borderRadius: "10px", cursor: "pointer" },
        }, "Use biometrics"),
      ),
      createElement("div", { style: { marginTop: "32px", textAlign: "center", fontSize: "12px", color: "#64748b" } }, "Protected by bank-grade encryption"),
    )
  )
}

const root = createRoot(document.getElementById("root"))
root.render(createElement(LoginPage))
`
  return entry
}

function htmlTemplate(jsCode: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Login Preview — Banking App</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', -apple-system, sans-serif; background: #0f172a; }
    #root { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.3.1",
      "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
      "react/jsx-dev-runtime": "https://esm.sh/react@18.3.1/jsx-dev-runtime",
      "react-dom": "https://esm.sh/react-dom@18.3.1",
      "react-dom/client": "https://esm.sh/react-dom@18.3.1/client"
    }
  }
  </script>
  <script type="module">
    ${jsCode}
  </script>
</body>
</html>`
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname.startsWith("/api/")) {
      const apiPath = url.pathname.replace("/api", "")
      return handleApi(req.method, apiPath)
    }

    if (url.pathname === "/home") {
      return new Response(
        `<html><body style="background:#0f172a;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:'DM Sans',sans-serif"><div style="text-align:center"><h1 style="font-size:32px;margin-bottom:8px">Home Screen</h1><p style="color:#94a3b8">You are logged in.</p><a href="/login" style="color:#3b82f6;margin-top:16px;display:inline-block">Back to login</a></div></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      )
    }

    const jsCode = buildComponentBundle()
    return new Response(htmlTemplate(jsCode), {
      headers: { "Content-Type": "text/html" },
    })
  },
})

console.log(`🏦 Banking Login Preview running at http://localhost:${server.port}`)
