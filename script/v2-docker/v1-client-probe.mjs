import { createOpencodeClient } from "@opencode-ai/sdk"

const baseUrl = process.argv[2]
const directory = process.argv[3]
const password = process.argv[4]

const client = createOpencodeClient({
  baseUrl,
  directory,
  ...(password ? { headers: { Authorization: `Basic ${password}` } } : {}),
})

const out = { baseUrl, directory, authSupplied: Boolean(password) }

async function step(name, fn) {
  const started = Date.now()
  try {
    const value = await fn()
    const text = JSON.stringify(value)
    out[name] = { verdict: "ok", ms: Date.now() - started, preview: text?.slice(0, 300) }
  } catch (error) {
    const message = String(error)
    let verdict = "error"
    if (/40[13]/i.test(message)) verdict = "unauthorized"
    else if (/404|not found/i.test(message)) verdict = "missing"
    out[name] = { verdict, ms: Date.now() - started, error: message.slice(0, 400) }
  }
}

await step("config.get", () => client.config.get())
await step("session.status", () => client.session.status())
await step("session.list", () => client.session.list())
await step("tui.showToast", () =>
  client.tui.showToast({ body: { message: "v2-smoke", variant: "info", duration: 100 } })
)
await step("model.list", () => client.provider.list())
await step("provider.list", () => client.provider.list())
await step("agent.list", () => client.agent.list())
await step("app.get", () => client.app.get())
await step("project.current", () => client.project.current())
await step("session.create", () => client.session.create({}))
await step("experimental.tool.ids", () => client.experimental.tool.ids())

console.log(JSON.stringify(out, null, 2))
