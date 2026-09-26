import { writeFileSync } from "node:fs"
import { OpenCode } from "@opencode/client"

const baseUrl = process.argv[2]
const password = process.argv[3] ?? ""
const directory = process.argv[4]
const outPath = process.argv[5] ?? "/work/out/v2-client-probe.json"

const client = OpenCode.make({
  baseUrl,
  headers: password
    ? { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` }
    : {},
})

const out = { baseUrl, directory, passwordSupplied: Boolean(password), steps: {} }

async function step(name, fn) {
  try {
    const value = await fn()
    out.steps[name] = { ok: true, value }
    return value
  } catch (error) {
    out.steps[name] = { ok: false, error: String(error) }
    return undefined
  }
}

await step("server.info", () => client.server.info())
const location = await step("location.get", () => client.location.get({ location: { directory } }))
await step("plugin.list", () => client.plugin.list({ location: { directory } }))
const agents = await step("agent.list", () => client.agent.list({ location: { directory } }))
const tools = await step("tool.list", () => client.tool.list())
const session = await step("session.create", () =>
  client.session.create({ title: "v2-smoke", location: { directory } })
)

out.locationDirectory = location?.directory ?? null
out.sessionId = session?.id ?? null
out.pluginIds = (out.steps["plugin.list"]?.value?.data ?? []).map((p) => p?.id ?? p?.name ?? "?")
out.agentIds = (agents?.data ?? []).map((a) => a?.id ?? a?.name ?? "?")
out.toolIds = (tools?.data ?? []).map((t) => t?.id ?? t?.name ?? "?")

const MATRIXX_AGENTS = [
  "morpheus", "keymaker", "oracle", "mouse", "merovingian", "operator", "trinity",
  "construct", "seraph", "smith", "architect", "cipher", "sentinel", "sati",
  "bdd-contract", "build",
]
out.matrixxAgentsPresent = MATRIXX_AGENTS.filter((name) => out.agentIds.includes(name))
out.matrixxAgentsMissing = MATRIXX_AGENTS.filter((name) => !out.agentIds.includes(name))

const MATRIXX_TOOLS = ["task_create", "task_update", "plan_read", "lsp_diagnostics", "ast_grep_search", "handoff"]
out.matrixxToolsPresent = MATRIXX_TOOLS.filter((name) => out.toolIds.includes(name))
out.matrixxToolsMissing = MATRIXX_TOOLS.filter((name) => !out.toolIds.includes(name))

if (out.sessionId) {
  await step("session.get", () => client.session.get({ sessionID: out.sessionId }))
  await step("session.context", () => client.session.context({ sessionID: out.sessionId }))
  await step("session.update", () => client.session.update({ sessionID: out.sessionId, title: "v2-smoke-2" }))
  await step("session.switchAgent", () =>
    client.session.switchAgent({ sessionID: out.sessionId, agent: "build" })
  )
  await step("session.synthetic", () =>
    client.session.synthetic({ sessionID: out.sessionId, text: "v2-smoke event driver" })
  )
}

await step("plugin.list.after", () => client.plugin.list({ location: { directory } }))
out.pluginIdsAfter = (out.steps["plugin.list.after"]?.value?.data ?? []).map((p) => p?.id ?? "?")

writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log(`wrote ${outPath}`)
