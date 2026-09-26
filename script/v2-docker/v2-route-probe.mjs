/**
 * Per-route V2 capability probe.
 *
 * For every V1 client member Matrixx actually calls, this records BOTH:
 *   - the raw HTTP route (method, path, status, content-type, SPA-vs-JSON), and
 *   - the V2-native client method (ok/error plus a structural payload summary).
 *
 * The distinction matters. V2 answers every unknown GET with its SPA at HTTP 200,
 * so status alone is not evidence a route exists. A route only counts as VERIFIED
 * when the body is real JSON. An SPA `text/html` 200 is recorded as SPA_HTML and
 * makes the probe exit non-zero, exactly as the refutation required.
 *
 * Session-scoped routes are probed against a session seeded with a synthetic
 * message, so "empty list" is distinguishable from "route does not work".
 *
 * Usage: node v2-route-probe.mjs <baseUrl> <password> <directory> <outPath>
 */
import { writeFileSync } from "node:fs"
import { OpenCode } from "@opencode/client"

const baseUrl = process.argv[2]
const password = process.argv[3] ?? ""
const directory = process.argv[4]
const outPath = process.argv[5] ?? "/work/out/v2-route-probe.json"

const auth = password
  ? `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`
  : ""

/**
 * `v1` is the Matrixx-facing V1 member. `route`/`method` are the V2 candidate
 * under test. `gap: true` marks a member with no V2 candidate at all — those are
 * asserted, not discovered, and must be reported rather than faked.
 */
const CANDIDATES = [
  { v1: "session.messages", route: ["/api/session/{sid}/message", "GET"], method: "message.list", seeds: true },
  { v1: "session.messages", route: ["/api/session/{sid}/context", "GET"], method: "session.context", seeds: true },
  { v1: "session.todo", route: ["/api/session/{sid}/todo", "GET"], method: null, seeds: true },
  { v1: "session.status", route: ["/api/session/active", "GET"], method: "session.active" },
  { v1: "session.status", route: ["/api/session/status", "GET"], method: null },
  { v1: "session.create", route: ["/api/session", "GET"], method: "session.list" },
  { v1: "session.get", route: ["/api/session/{sid}", "GET"], method: "session.get", seeds: true },
  { v1: "session.message", route: ["/api/session/{sid}/message", "GET"], method: "message.list", seeds: true },
  { v1: "session.list", route: ["/api/session", "GET"], method: "session.list" },
  // V1 contract members that `src/` never calls but the V1 client exposes, so
  // they are probed rather than left to assumption.
  { v1: "session.children", route: ["/api/session", "GET"], method: "session.list" },
  { v1: "session.revert", route: ["/api/session/{sid}/revert", "POST"], method: null, probeMode: "empty-body" },
  { v1: "model.list", route: ["/api/model", "GET"], method: "model.list" },
  { v1: "provider.list", route: ["/api/provider", "GET"], method: "provider.list" },
  { v1: "config.get", route: ["/api/config", "GET"], method: "config.get" },
  { v1: "command.list", route: ["/api/command", "GET"], method: "command.list" },
  { v1: "app.agents", route: ["/api/agent", "GET"], method: "agent.list" },
  { v1: "tui.showToast", route: ["/api/tui/show-toast", "POST"], method: null },
  // Negative control: the V1 path for the same member. SPA here is the expected
  // result and is the evidence that no V2 route exists, so it must not be
  // counted as a probe failure.
  { v1: "tui.showToast", route: ["/tui/show-toast", "GET"], method: null, negativeControl: true },
  // Mutating routes. Probed for EXISTENCE only, in the least destructive way
  // available: an empty body makes the server answer with a JSON validation
  // error, which proves the route is mounted and distinct from 404/SPA. A
  // 4xx carrying a JSON body is therefore `REAL_JSON` for route-existence
  // purposes — recorded distinctly as ROUTE_EXISTS so nobody mistakes it for a
  // successful data read.
  { v1: "session.promptAsync", route: ["/api/session/{sid}/prompt", "POST"], method: "session.prompt", probeMode: "empty-body" },
  { v1: "session.prompt", route: ["/api/session/{sid}/prompt", "POST"], method: "session.prompt", probeMode: "empty-body" },
  { v1: "session.abort", route: ["/api/session/{sid}/interrupt", "POST"], method: "session.interrupt", probeMode: "empty-body" },
  { v1: "session.summarize", route: ["/api/session/{sid}/compact", "POST"], method: "session.compact", probeMode: "empty-body" },
  { v1: "session.delete", route: ["/api/session/{thawid}", "DELETE"], method: "session.remove", probeMode: "sacrificial" },
  // Diagnostic: prove the SPA catch-all is real, so a SPA_HTML verdict below is
  // provably a false route rather than a broken probe.
  { v1: "__spa_control__", route: ["/definitely-not-a-real-route-xyz", "GET"], method: null, control: true },
]

const looksLikeHtml = (text) => /^\s*(<!doctype html|<html)/i.test(text)

/** Structural summary, so "real but empty" is distinguishable from "not real". */
function summarize(payload) {
  if (payload === undefined) return { shape: "undefined" }
  if (payload === null) return { shape: "null" }
  if (Array.isArray(payload)) return { shape: "array", count: payload.length, sampleKeys: Object.keys(payload[0] ?? {}) }
  if (typeof payload === "object") {
    const data = payload.data
    return {
      shape: "object",
      keys: Object.keys(payload),
      dataShape: Array.isArray(data) ? `array(${data.length})` : typeof data,
      sampleKeys: Array.isArray(data) && data[0] ? Object.keys(data[0]) : undefined,
    }
  }
  return { shape: typeof payload }
}

async function http(method, path, body) {
  const url = new URL(path, baseUrl)
  url.searchParams.set("directory", directory)
  try {
    const response = await fetch(url, {
      method,
      headers: { Authorization: auth, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    })
    const text = await response.text()
    const contentType = response.headers.get("content-type") ?? ""
    const isHtml = looksLikeHtml(text)
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }
    // A JSON content-type with an unparseable body, or an HTML body, both mean
    // "this is not the API".
    const realJson = contentType.includes("application/json") && json !== undefined && !isHtml
    return {
      method,
      path,
      status: response.status,
      contentType: contentType.split(";")[0] ?? "",
      isHtml,
      isJson: realJson,
      bodyLength: text.length,
      payload: realJson ? summarize(json) : undefined,
      preview: isHtml ? text.slice(0, 120) : text.slice(0, 200),
    }
  } catch (error) {
    return { method, path, status: null, contentType: "", isHtml: false, isJson: false, error: String(error) }
  }
}

/** Verdict precedence: control, then transport, then SPA, then real JSON. */
function verdict(probe) {
  if (probe.error) return "TRANSPORT_ERROR"
  if (probe.isHtml) return "SPA_HTML"
  if (probe.isJson) return "REAL_JSON"
  if (probe.status === 204) return "NO_CONTENT"
  if (probe.status === 404) return "MISSING"
  if (probe.status === 401 || probe.status === 403) return "UNAUTHORIZED"
  if (probe.status === 405) return "METHOD_NOT_ALLOWED"
  if (probe.status && probe.status >= 200 && probe.status < 300) return "NON_JSON_BODY"
  return `STATUS_${probe.status}`
}

/** 204 is success for routes whose success response carries no body. */
const PROVES_ROUTE = (v) => v === "REAL_JSON" || v === "NO_CONTENT"

const client = OpenCode.make({
  baseUrl,
  headers: password ? { Authorization: auth } : {},
})

async function viaClient(methodName, sid) {
  if (!methodName) return { attempted: false, reason: "no V2 client method" }
  try {
    const domain = methodName.split(".").slice(0, -1).join(".")
    const fn = methodName.split(".").pop()
    const input = sid ? { sessionID: sid, location: { directory } } : { location: { directory } }
    const value = await client[domain][fn](input)
    return { attempted: true, ok: true, ...summarize(value) }
  } catch (error) {
    return { attempted: true, ok: false, error: String(error).slice(0, 300) }
  }
}

const out = { baseUrl, directory, passwordSupplied: Boolean(password), sessionId: null, seeded: false, routes: {}, members: {} }

let sessionId = null
try {
  const created = await client.session.create({ title: "route-probe", location: { directory } })
  sessionId = created?.id ?? null
} catch (error) {
  out.sessionCreateError = String(error)
}
out.sessionId = sessionId

// Seed a message so message-reading routes can be judged non-empty-vs-empty.
if (sessionId) {
  try {
    await client.session.synthetic({ sessionID: sessionId, text: "route-probe seed message" })
    out.seeded = true
  } catch (error) {
    out.seedError = String(error)
  }
}

let sacrificialId = null
if (CANDIDATES.some((c) => c.probeMode === "sacrificial")) {
  try {
    sacrificialId = (await client.session.create({ title: "route-probe-sacrificial", location: { directory } }))?.id ?? null
  } catch (error) {
    out.sacrificialCreateError = String(error)
  }
}

for (const candidate of CANDIDATES) {
  const path = candidate.route[0]
    .replace("{sid}", sessionId ?? "__nosession__")
    .replace("{thawid}", sacrificialId ?? "__nosession__")
  const method = candidate.route[1]
  // "empty-body" and "sacrificial" send a deliberately incomplete body so the
  // server can answer without performing a real mutation.
  const body = method === "GET" || method === "DELETE" ? undefined : {}

  const probe = await http(method, path, body)
  const clientResult = candidate.probeMode ? { attempted: false, reason: "mutating route; not invoked via client" } : await viaClient(candidate.method, sessionId)
  const isExistenceProbe = Boolean(candidate.probeMode)
  const resolvedVerdict = verdict(probe)
  const record = {
    v1: candidate.v1,
    candidatePath: candidate.route[0],
    httpMethod: method,
    resolvedPath: path,
    verdict: resolvedVerdict,
    // A JSON error body on a 4xx still proves the route is mounted. Recorded
    // separately from REAL_JSON so a data read is never inferred from it.
    routeExists: PROVES_ROUTE(resolvedVerdict) && isExistenceProbe,
    existenceProbe: isExistenceProbe,
    negativeControl: Boolean(candidate.negativeControl),
    status: probe.status,
    contentType: probe.contentType,
    isHtml: probe.isHtml,
    bodyLength: probe.bodyLength,
    payload: probe.payload,
    clientMethod: candidate.method,
    client: clientResult,
    preview: probe.preview,
  }
  out.routes[`${candidate.v1} :: ${candidate.method ?? candidate.route[0]}`] = record
}

// Collapse to a per-V1-member view. A member counts as mapped when a candidate
// either returned real JSON data or proved the route exists.
for (const [key, record] of Object.entries(out.routes)) {
  const entry = (out.members[record.v1] ??= { verified: [], rejected: [] })
  if (PROVES_ROUTE(record.verdict)) entry.verified.push(record)
  else entry.rejected.push(record)
}
for (const [member, entry] of Object.entries(out.members)) {
  const dataRead = entry.verified.find((r) => !r.existenceProbe)
  const existence = entry.verified.find((r) => r.existenceProbe)
  entry.status = entry.verified.length > 0 ? "MAPPED" : "NO_V2_ROUTE"
  if (dataRead) entry.best = dataRead
  else if (existence) entry.best = existence
  entry.evidence = dataRead ? "data-read" : existence ? "route-exists-only" : "none"
}

writeFileSync(outPath, JSON.stringify(out, null, 2))

// ---- console table ---------------------------------------------------------
const control = Object.values(out.routes).find((r) => r.v1 === "__spa_control__")
const rows = Object.values(out.routes).filter((r) => r.v1 !== "__spa_control__")
const w = Math.max(...rows.map((r) => r.v1.length), 10)
console.log(`SPA control route ${control?.candidatePath} -> ${control?.verdict} (${control?.status} ${control?.contentType})`)
console.log("")
for (const r of rows) {
  const count = r.payload?.count ?? (typeof r.payload?.dataShape === "string" ? r.payload.dataShape : "")
  const clientState = r.client?.attempted ? (r.client.ok ? "client:ok" : "client:err") : "client:n/a"
  console.log(
    `${r.v1.padEnd(w)}  ${String(r.status ?? "-").padEnd(4)} ${(r.contentType || "-").padEnd(18)} ${r.verdict.padEnd(14)} ${clientState.padEnd(11)} ${count ?? ""}`
  )
}
console.log("")
for (const [member, entry] of Object.entries(out.members)) {
  console.log(`${member.padEnd(w)}  => ${entry.status}${entry.best?.clientMethod ? ` via ${entry.best.clientMethod} (${entry.best.candidatePath})` : ""}`)
}

const failures = rows.filter((r) => r.verdict === "SPA_HTML" && !r.negativeControl)
const unmapped = Object.values(out.members).filter((m) => m.status === "NO_V2_ROUTE")
console.log("")
console.log(`SPA_HTML on real candidates: ${failures.length}`)
console.log(`Unmapped V1 members (report as gaps): ${unmapped.length} -> ${unmapped.map((m) => m.v1).join(", ") || "(none)"}`)

if (control && control.verdict !== "SPA_HTML") {
  console.log(`CONTROL FAILED: the SPA catch-all did not reproduce (${control.verdict}); verdicts below are unreliable.`)
  process.exit(2)
}
if (failures.length > 0) {
  console.log(`FAIL: ${failures.length} candidate route(s) returned SPA HTML, not the API.`)
  process.exit(1)
}
console.log("OK: every probed candidate route returned real JSON.")
process.exit(0)
