/**
 * CDN React preview server for visual review of generated BDD components.
 *
 * Bundles the TSX components + an entry-point render script using Bun.build,
 * serves them alongside React/ReactDOM loaded from esm.sh CDN.
 *
 * Usage: bun run src/features/bdd/fixtures/preview-server.ts
 * Open http://localhost:4000 in a browser.
 */

const COMPONENTS_DIR = import.meta.dir
const PORT = parseInt(process.env.PREVIEW_PORT || "4000", 10)

async function buildBundle(): Promise<string> {
  const entryPoint = [
    `import React from "react"`,
    `import { createRoot } from "react-dom/client"`,
    `import { LoginPage } from "${COMPONENTS_DIR}/components/LoginPage"`,
    ``,
    `const root = document.getElementById("root")`,
    `if (root) {`,
    `  createRoot(root).render(`,
    `    React.createElement(LoginPage, {`,
    `      onLoginSuccess: () => {`,
    `        console.log("Login success");`,
    `      },`,
    `    }),`,
    `  )`,
    `}`,
  ].join("\n")

  const tmpDir = `${COMPONENTS_DIR}/.preview`
  await Bun.write(`${tmpDir}/entry.tsx`, entryPoint)

  const result = await Bun.build({
    entrypoints: [`${tmpDir}/entry.tsx`],
    target: "browser",
    format: "esm",
    splitting: false,
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
    minify: false,
  })

  Bun.spawnSync(["rm", "-rf", tmpDir])

  if (!result.success) {
    throw new AggregateError(result.logs, "Bundle failed")
  }

  return await result.outputs[0].text()
}

function pageHtml(bundleCode: string): string {
  const importMap = {
    imports: {
      react: "https://esm.sh/react@18.3.1",
      "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
      "react/jsx-dev-runtime": "https://esm.sh/react@18.3.1/jsx-dev-runtime",
      "react-dom": "https://esm.sh/react-dom@18.3.1",
      "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
    },
  }

  return [
    `<!DOCTYPE html>`,
    `<html lang="en">`,
    `<head>`,
    `  <meta charset="UTF-8" />`,
    `  <meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
    `  <title>Login — BDD Component Preview</title>`,
    `  <script type="importmap">${JSON.stringify(importMap, null, 2)}</script>`,
    `  <style>`,
    `    * { box-sizing: border-box; margin: 0; padding: 0; }`,
    `    body {`,
    `      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;`,
    `      background: #f0f2f5;`,
    `      min-height: 100vh;`,
    `    }`,
    `  </style>`,
    `</head>`,
    `<body>`,
    `  <div id="root"></div>`,
    `  <script type="module">`,
    bundleCode,
    `  </script>`,
    `</body>`,
    `</html>`,
  ].join("\n")
}

Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === "POST" && url.pathname === "/api/v1/auth/login") {
      return new Response(
        JSON.stringify({
          token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock",
          redirect: "/dashboard",
        }),
        { headers: { "Content-Type": "application/json" } },
      )
    }

    if (url.pathname === "/" || url.pathname === "/login") {
      const bundle = await buildBundle()
      return new Response(pageHtml(bundle), {
        headers: { "Content-Type": "text/html" },
      })
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`Preview server: http://localhost:${PORT}`)
