import { writeFileSync } from "node:fs"

const BASE = process.env.PROBE_BASE ?? "http://127.0.0.1:4096"
const PASSWORD = process.env.PROBE_PASSWORD ?? ""
const USERNAME = process.env.PROBE_USERNAME ?? "opencode"
const DIRECTORY = process.env.PROBE_DIRECTORY ?? "/work/project"
const OUT = process.env.PROBE_OUT ?? "/work/out/http-probe.json"

const auth = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`

const GET_TARGETS = [
  ["config.get", "/config"],
  ["session.status", "/session/status"],
  ["session.list", "/session"],
  ["tui.showToast", "/tui/show-toast"],
  ["model.list", "/config/providers"],
  ["provider.list", "/provider"],
  ["agent.list", "/agent"],
  ["command.list", "/command"],
  ["project.current", "/project/current"],
  ["experimental.tool.ids", "/experimental/tool/ids"],
  ["app", "/app"],
  ["event", "/event"],
]

async function call(method, path, body) {
  const url = new URL(path, BASE)
  url.searchParams.set("directory", DIRECTORY)
  const started = Date.now()
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: auth,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    return {
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - started,
      contentType: response.headers.get("content-type"),
      bodyPreview: text.slice(0, 600),
      bodyLength: text.length,
    }
  } catch (error) {
    return { status: null, ok: false, durationMs: Date.now() - started, error: String(error) }
  }
}

function classify(result) {
  if (result.error) return "error"
  if (result.status === 404) return "missing"
  if (result.status >= 200 && result.status < 300) return "ok"
  if (result.status === 401 || result.status === 403) return "unauthorized"
  return "other"
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function extractIds(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.agents)
        ? payload.agents
        : undefined
  if (!list) return undefined
  return list.map((item) => (typeof item === "string" ? item : (item?.name ?? item?.id ?? "??")))
}

async function main() {
  const report = { base: BASE, directory: DIRECTORY, hasPassword: PASSWORD.length > 0, gets: {} }

  for (const [name, path] of GET_TARGETS) {
    const result = await call("GET", path)
    report.gets[name] = {
      path,
      verdict: classify(result),
      status: result.status,
      contentType: result.contentType,
      bodyLength: result.bodyLength,
      bodyPreview: result.bodyPreview,
      error: result.error,
    }
  }

  report.unauthenticated = {
    config: (await fetch(new URL("/config", BASE))).status,
  }

  report.posts = {}
  const sessionCreate = await call("POST", "/session", {})
  report.posts.sessionCreate = {
    verdict: classify(sessionCreate),
    status: sessionCreate.status,
    bodyPreview: sessionCreate.bodyPreview,
  }
  const sessionId = parseJson(sessionCreate.bodyPreview ?? "")?.id
  report.sessionId = sessionId ?? null

  if (sessionId) {
    const messages = await call("GET", `/session/${sessionId}/message`)
    report.gets["session.messages"] = {
      path: `/session/${sessionId}/message`,
      verdict: classify(messages),
      status: messages.status,
      bodyPreview: messages.bodyPreview,
    }
  }

  const agentsRaw = await call("GET", "/agent")
  const agentIds = extractIds(parseJson(agentsRaw.bodyPreview ?? ""))
  report.agentIds = agentIds ?? null

  const MATRIXX_AGENTS = [
    "morpheus", "keymaker", "oracle", "mouse", "merovingian", "operator",
    "trinity", "construct", "seraph", "smith", "architect", "cipher",
    "sentinel", "sati", "bdd-contract", "build",
  ]
  report.matrixxAgentsPresent = agentIds
    ? MATRIXX_AGENTS.filter((name) => agentIds.includes(name))
    : null
  report.matrixxAgentsMissing = agentIds
    ? MATRIXX_AGENTS.filter((name) => !agentIds.includes(name))
    : null

  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(`wrote ${OUT}`)
}

await main()
