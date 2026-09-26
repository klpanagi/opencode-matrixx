import { readFileSync, writeFileSync } from "node:fs"
import { OpenCode } from "@opencode/client"

// Asserting probe: the ONLY acceptable evidence that the Matrixx agents exist
// on a real V2 host is a live `agent.list` whose parsed JSON names them.
//
// Three guards make a vacuous pass impossible:
//   1. the payload must be an array of objects carrying a string `id`
//      (the V2 server answers unknown paths with SPA HTML at HTTP 200, so a
//      status code or a bare "did not throw" is worthless here),
//   2. a NEGATIVE CONTROL id that was never registered must be absent,
//   3. the listed ids must cover every id the plugin itself resolved, read
//      back from the Matrixx log the plugin wrote inside the same container.

const baseUrl = process.argv[2]
const password = process.argv[3] ?? ""
const directory = process.argv[4]
const outPath = process.argv[5] ?? "/work/out/agent-listing-probe.json"
const exitPath = process.argv[6] ?? "/work/out/agent-listing-probe.exit"
const matrixxLog = process.argv[7] ?? "/tmp/matrixx.log"

const NEGATIVE_CONTROL = "matrixx-agent-that-was-never-registered"

const client = OpenCode.make({
  baseUrl,
  headers: password
    ? { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` }
    : {},
})

const out = { baseUrl, directory, checks: [], missing: [] }

function check(name, ok, detail) {
  out.checks.push({ name, ok, detail: detail ?? null })
  return ok
}

let agentIds = []
try {
  const response = await client.agent.list({ location: { directory } })
  const data = response?.data
  out.rawShape = Array.isArray(data) ? "array" : typeof data
  out.sample = Array.isArray(data) ? JSON.stringify(data[0] ?? null).slice(0, 400) : null
  check("agent.list returned an array", Array.isArray(data), out.rawShape)
  if (Array.isArray(data)) {
    out.malformed = data.filter((a) => typeof a?.id !== "string").length
    check("every entry has a string id", out.malformed === 0, `${out.malformed} malformed`)
    agentIds = data.map((a) => a.id)
  }
} catch (error) {
  out.error = String(error)
  check("agent.list succeeded", false, String(error))
}

out.agentIds = agentIds.sort()
out.totalAgents = agentIds.length
out.negativeControl = NEGATIVE_CONTROL
out.negativeControlPresent = agentIds.includes(NEGATIVE_CONTROL)
check("negative control absent", !out.negativeControlPresent, NEGATIVE_CONTROL)

// The set the plugin says it registered, from its own log in this container.
let resolvedIds = []
try {
  const log = readFileSync(matrixxLog, "utf8")
  const line = log
    .split("\n")
    .find((l) => l.includes("V2 agents registered via editor.update"))
  out.resolvedLogLine = line ?? null
  const match = line?.match(/"ids":(\[.*\])/)
  if (match) resolvedIds = JSON.parse(match[1])
} catch (error) {
  out.resolvedLogError = String(error)
}
out.resolvedIds = resolvedIds.sort()
check("plugin logged a non-empty resolved agent set", resolvedIds.length > 0, `${resolvedIds.length}`)

out.resolvedButNotListed = resolvedIds.filter((id) => !agentIds.includes(id))
check(
  "every agent the plugin resolved is visible on the live host",
  resolvedIds.length > 0 && out.resolvedButNotListed.length === 0,
  out.resolvedButNotListed.join(",") || "none",
)

out.missing = resolvedIds.filter((id) => !agentIds.includes(id))
out.ok = out.checks.every((c) => c.ok)
writeFileSync(outPath, JSON.stringify(out, null, 2))
writeFileSync(exitPath, out.ok ? "0" : "1")
console.log(`agent-listing-probe ok=${out.ok} agents=${agentIds.length} resolved=${resolvedIds.length}`)
