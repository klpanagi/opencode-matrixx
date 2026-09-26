import { writeFileSync, appendFileSync } from "node:fs"
import { Plugin } from "@opencode/plugin"

const OUT = process.env.PROBE_PLUGIN_OUT ?? "/work/out/probe-plugin.json"
const TRACE = process.env.PROBE_PLUGIN_TRACE ?? "/work/out/probe-plugin-trace.log"

function record(event, data) {
  appendFileSync(TRACE, `${new Date().toISOString()} ${event} ${JSON.stringify(data ?? {})}\n`)
}

function ownKeys(value) {
  if (value === null || value === undefined) return String(value)
  if (typeof value !== "object") return typeof value
  return Object.keys(value).sort()
}

function protoChain(value) {
  if (value === null || value === undefined || typeof value !== "object") return []
  const out = []
  let current = Object.getPrototypeOf(value)
  while (current && current !== Object.prototype) {
    const methods = Object.getOwnPropertyNames(current)
      .filter((name) => name !== "constructor")
      .sort()
    out.push({ ctor: current.constructor?.name ?? "unknown", methods })
    current = Object.getPrototypeOf(current)
  }
  return out
}

const OPENCODE_ENV_KEYS = [
  "OPENCODE",
  "OPENCODE_PID",
  "OPENCODE_PORT",
  "OPENCODE_HOST",
  "OPENCODE_SERVER",
  "OPENCODE_SERVER_URL",
  "OPENCODE_SERVER_USERNAME",
  "OPENCODE_SERVER_PASSWORD",
]

const probe = Plugin.define({
  id: "matrixx-v2-probe",
  setup: async (ctx) => {
    record("setup-called", { ctxKeys: ownKeys(ctx) })

    const envPresence = {}
    for (const key of OPENCODE_ENV_KEYS) {
      envPresence[key] = key in process.env
    }

    const report = {
      observedAt: new Date().toISOString(),
      runtime: {
        execPath: process.execPath,
        argv: process.argv,
        versions: { node: process.versions.node, bun: process.versions.bun ?? null },
        cwd: process.cwd(),
      },
      ctxKeys: ownKeys(ctx),
      ctxProtoChain: protoChain(ctx),
      location: ctx.location ?? null,
      nested: {
        agent: { keys: ownKeys(ctx.agent), proto: protoChain(ctx.agent) },
        app: { keys: ownKeys(ctx.app), proto: protoChain(ctx.app) },
        tool: { keys: ownKeys(ctx.tool), proto: protoChain(ctx.tool) },
        session: { keys: ownKeys(ctx.session), proto: protoChain(ctx.session) },
        event: { keys: ownKeys(ctx.event), proto: protoChain(ctx.event) },
        project: { keys: ownKeys(ctx.project), proto: protoChain(ctx.project) },
        permission: { keys: ownKeys(ctx.permission), proto: protoChain(ctx.permission) },
        mcp: { keys: ownKeys(ctx.mcp), proto: protoChain(ctx.mcp) },
        command: { keys: ownKeys(ctx.command), proto: protoChain(ctx.command) },
        client: ownKeys(ctx.client),
      },
      envPresence,
      envValues: {
        OPENCODE: process.env.OPENCODE ?? null,
        OPENCODE_PORT: process.env.OPENCODE_PORT ?? null,
        OPENCODE_SERVER_URL: process.env.OPENCODE_SERVER_URL ?? null,
        OPENCODE_SERVER_PASSWORD_length:
          typeof process.env.OPENCODE_SERVER_PASSWORD === "string"
            ? process.env.OPENCODE_SERVER_PASSWORD.length
            : null,
      },
    }

    writeFileSync(OUT, JSON.stringify(report, null, 2))
    record("report-written", { out: OUT })

    const stream = ctx.event.subscribe()
    record("subscribe-called", { streamType: typeof stream, hasThen: typeof stream?.then === "function" })
    ;(async () => {
      try {
        const iterable = typeof stream?.then === "function" ? await stream : stream
        record("stream-acquired", { hasAsyncIterator: typeof iterable?.[Symbol.asyncIterator] === "function" })
        for await (const event of iterable) {
          record("event", { type: event?.type })
        }
        record("event-stream-ended")
      } catch (error) {
        record("event-stream-error", { error: String(error) })
      }
    })()

    return async () => {
      record("disposed")
    }
  },
})

export default probe
