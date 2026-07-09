const PORT = parseInt(
  process.env.PREVIEW_PORT ?? process.env.PORT ?? "3000",
  10,
);
const HOST = process.env.PREVIEW_HOST ?? process.env.HOST ?? "127.0.0.1";

let quickLoginExpired = false;
let attemptCount = 0;
let lockoutCycles = 0;
let isSuspended = false;
let isLocked = false;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      ...(init.headers ?? {}),
    },
  });
}

function emptyResponse(status = 204): Response {
  return new Response(null, { status, headers: { "access-control-allow-origin": "*" } });
}

function handleLogin(body: string): Response {
  const { username, password } = JSON.parse(body) as { username?: string; password?: string };

  if (isSuspended) {
    return jsonResponse(
      {
        error: "Your account is suspended. Please contact the Contact Centre for manual re-enablement.",
        code: "ACCOUNT_SUSPENDED",
      },
      { status: 403 },
    );
  }

  if (isLocked) {
    return jsonResponse(
      {
        error: "Your account has been locked due to multiple failed login attempts. Please contact customer support to unlock your account.",
        code: "ACCOUNT_LOCKED",
      },
      { status: 423 },
    );
  }

  if (!username || !password) {
    return jsonResponse(
      { error: "Please enter both username and password." },
      { status: 400 },
    );
  }

  const credentialsValid = password !== "WRONG_PASSWORD" && password.length > 0;
  if (!credentialsValid) {
    attemptCount += 1;
    if (attemptCount >= 3) {
      isLocked = true;
      attemptCount = 0;
      lockoutCycles += 1;
      if (lockoutCycles >= 3) {
        isSuspended = true;
        isLocked = false;
        return jsonResponse(
          {
            error: "Your account is suspended. Please contact the Contact Centre for manual re-enablement.",
            code: "ACCOUNT_SUSPENDED",
          },
          { status: 403 },
        );
      }
      return jsonResponse(
        {
          error: "Your account has been locked due to multiple failed login attempts. Please contact customer support to unlock your account.",
          code: "ACCOUNT_LOCKED",
        },
        { status: 423 },
      );
    }
    return jsonResponse(
      { error: "Invalid username or password. Please try again.", code: "INVALID_CREDENTIALS" },
      { status: 401 },
    );
  }

  attemptCount = 0;
  return jsonResponse({
    token: "mock-jwt-token",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Sign in</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; padding: 1.5rem; max-width: 32rem; }
  h1 { font-size: 1.5rem; margin: 0 0 1rem; }
  form { display: grid; gap: 0.75rem; }
  label { font-size: 0.875rem; font-weight: 600; display: grid; gap: 0.25rem; }
  input { font-size: 1rem; padding: 0.625rem 0.75rem; border: 1px solid #8884; border-radius: 0.375rem; }
  button { font-size: 1rem; padding: 0.75rem 1rem; border-radius: 0.375rem; border: 0; background: #2563eb; color: white; cursor: pointer; }
  button[disabled] { opacity: 0.6; cursor: not-allowed; }
  .banner { padding: 0.75rem 1rem; border-radius: 0.375rem; margin-bottom: 1rem; }
  .banner--amber { background: #fde68a; color: #78350f; border: 1px solid #f59e0b; }
  .msg { font-size: 0.95rem; padding: 0.5rem 0; }
  .msg--success { color: #166534; }
  .msg--error { color: #991b1b; }
  .biometric { background: transparent; color: #2563eb; border: 1px solid #2563eb; margin-top: 0.5rem; }
</style>
</head>
<body>
<main>
<h1>Sign in</h1>
<div data-testid="quick-login-expired-banner" class="banner banner--amber" hidden>
  Quick Login Expired. For your security, please sign in again with your email and password.
</div>
<form id="login-form" autocomplete="off">
  <label>Username <input id="username" data-testid="username-input" name="username" type="text" autocomplete="username" /></label>
  <label>Password <input id="password" data-testid="password-input" name="password" type="password" autocomplete="current-password" /></label>
  <button id="sign-in-button" data-testid="sign-in-button" type="submit">Sign in</button>
  <button id="biometric-shortcut-button" data-testid="biometric-shortcut-button" type="button" class="biometric">Biometric Login</button>
  <div id="login-success-message" data-testid="login-success-message" class="msg msg--success" hidden></div>
  <div id="login-error-message" data-testid="login-error-message" class="msg msg--error" role="alert" hidden></div>
  <div id="loading-indicator" data-testid="loading-indicator" class="msg" hidden>Signing in...</div>
</form>
</main>
<script>
(function () {
  var form = document.getElementById("login-form");
  var usernameInput = document.getElementById("username");
  var passwordInput = document.getElementById("password");
  var signInButton = document.getElementById("sign-in-button");
  var biometricButton = document.getElementById("biometric-shortcut-button");
  var successMessage = document.getElementById("login-success-message");
  var errorMessage = document.getElementById("login-error-message");
  var loadingIndicator = document.getElementById("loading-indicator");
  var banner = document.querySelector('[data-testid="quick-login-expired-banner"]');
  var loading = false;

  var url = new URL(window.location.href);
  if (
    sessionStorage.getItem("quickLoginExpired") === "true" ||
    url.searchParams.get("quickLoginExpired") === "true"
  ) {
    banner.hidden = false;
  }

  var savedUsername = sessionStorage.getItem("preservedUsername");
  if (savedUsername !== null) {
    usernameInput.value = savedUsername;
    sessionStorage.removeItem("preservedUsername");
  }

  biometricButton.addEventListener("click", function () {
    if (usernameInput.value.trim()) {
      sessionStorage.setItem("preservedUsername", usernameInput.value.trim());
    }
    location.assign("/login/biometric");
  });

  function clearMessages() {
    successMessage.hidden = true;
    errorMessage.hidden = true;
    errorMessage.textContent = "";
  }
  usernameInput.addEventListener("input", clearMessages);
  passwordInput.addEventListener("input", clearMessages);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (loading) return;
    clearMessages();
    var username = usernameInput.value.trim();
    var password = passwordInput.value;
    if (!username || !password) {
      errorMessage.textContent = "Please enter both username and password.";
      errorMessage.hidden = false;
      return;
    }
    loading = true;
    signInButton.disabled = true;
    signInButton.textContent = "Signing in...";
    if (loadingIndicator) loadingIndicator.hidden = false;
    fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: username, password: password }),
    })
      .then(function (response) {
        return response.json().then(function (body) {
          return { status: response.status, body: body };
        });
      })
      .then(function (result) {
        loading = false;
        signInButton.disabled = false;
        signInButton.textContent = "Sign in";
        if (loadingIndicator) loadingIndicator.hidden = true;
        if (result.status === 200) {
          successMessage.textContent = "Login successful!";
          successMessage.hidden = false;
          setTimeout(function () { location.assign("/home"); }, 150);
          return;
        }
        errorMessage.textContent = (result.body && result.body.error) || "Sign in failed.";
        errorMessage.hidden = false;
      })
      .catch(function () {
        loading = false;
        signInButton.disabled = false;
        signInButton.textContent = "Sign in";
        if (loadingIndicator) loadingIndicator.hidden = true;
        errorMessage.textContent = "An unexpected error occurred. Please try again.";
        errorMessage.hidden = false;
      });
  });
})();
</script>
</body>
</html>`;

const homeHtml = `<!doctype html><html><body><div data-testid="home-page">Home</div></body></html>`;
const biometricHtml = `<!doctype html><html><body><div data-testid="biometric-login-page">Biometric login</div></body></html>`;

Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return emptyResponse(204);
    if (url.pathname === "/") {
      return new Response("OK", { status: 200, headers: { "content-type": "text/plain" } });
    }
    if (url.pathname === "/login") {
      return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/home") {
      return new Response(homeHtml, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/login/biometric") {
      return new Response(biometricHtml, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/api/v1/auth/login" && req.method === "POST") {
      const body = await req.text();
      return handleLogin(body);
    }
    if (url.pathname === "/api/v1/auth/attempts/clear" && req.method === "POST") {
      attemptCount = 0;
      return jsonResponse({ ok: true });
    }
    if (url.pathname === "/__test__/seed" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (typeof body.quickLoginExpired === "boolean") quickLoginExpired = body.quickLoginExpired;
      if (typeof body.attemptCount === "number") attemptCount = body.attemptCount;
      if (typeof body.lockoutCycles === "number") lockoutCycles = body.lockoutCycles;
      if (typeof body.isSuspended === "boolean") isSuspended = body.isSuspended;
      if (typeof body.isLocked === "boolean") isLocked = body.isLocked;
      return jsonResponse({ ok: true });
    }
    if (url.pathname === "/__test__/reset" && req.method === "POST") {
      quickLoginExpired = false;
      attemptCount = 0;
      lockoutCycles = 0;
      isSuspended = false;
      isLocked = false;
      return jsonResponse({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`[bdd-login] preview server listening on http://${HOST}:${PORT}`);
