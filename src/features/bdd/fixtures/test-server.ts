/**
 * Minimal test server for BDD-generated login tests.
 * Serves a login form at /login and a dashboard at /dashboard.
 * Run: bun run src/features/bdd/fixtures/test-server.ts
 */

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="en">
<body>
  <div data-testid="login-form-component">
    <form action="/api/v1/auth/login" method="POST">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" />
      <button type="submit" data-testid="login-submit-button">Sign in</button>
    </form>
  </div>
  <script>
    document.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const res = await fetch("/api/v1/auth/login", { method: "POST" });
      if (res.ok) window.location.href = "/dashboard";
    });
  </script>
</body>
</html>`

const DASHBOARD_PAGE = `<!DOCTYPE html>
<html lang="en">
<body>
  <h1>Welcome</h1>
  <p>You are now signed in.</p>
</body>
</html>`

const port = parseInt(process.env.PORT || "3000", 10)

Bun.serve({
  port,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === "POST" && url.pathname === "/api/v1/auth/login") {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    if (url.pathname === "/login") {
      return new Response(LOGIN_PAGE, {
        headers: { "Content-Type": "text/html" },
      })
    }

    if (url.pathname === "/dashboard") {
      return new Response(DASHBOARD_PAGE, {
        headers: { "Content-Type": "text/html" },
      })
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`Test server running at http://localhost:${port}`)
