import { z } from "zod"
import { AuthService } from "./auth-service.ts"
import {
  ClearAttemptsRequestSchema,
  ERROR_STATUS,
  type LoginError,
  LoginRequestSchema,
} from "./types.ts"

const SeedStateSchema = z.object({
  username: z.string().min(1),
  attemptCount: z.number().int().nonnegative().optional(),
  lockoutCycles: z.number().int().nonnegative().optional(),
  isLocked: z.boolean().optional(),
  lockedUntil: z.number().int().nullable().optional(),
  isSuspended: z.boolean().optional(),
})

const SeedPayloadSchema = z.object({
  state: SeedStateSchema,
})

export type ServerOptions = {
  service?: AuthService
  port?: number
  hostname?: string
}

export type ServerHandle = {
  port: number
  hostname: string
  stop: () => Promise<void>
}

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const errorStatus = (err: LoginError): number => ERROR_STATUS[err.code]

const readJson = async (req: Request): Promise<unknown> => {
  try {
    return await req.json()
  } catch (_cause) {
    return null
  }
}

const handleLogin = async (
  req: Request,
  service: AuthService,
): Promise<Response> => {
  const body = await readJson(req)
  const parsed = LoginRequestSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, {
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Invalid request body",
    })
  }
  const result = await service.login(parsed.data)
  if (result.ok) {
    return jsonResponse(200, result.value)
  }
  return jsonResponse(errorStatus(result.error), result.error)
}

const handleClearAttempts = async (
  req: Request,
  service: AuthService,
): Promise<Response> => {
  const body = await readJson(req)
  const parsed = ClearAttemptsRequestSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, {
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Invalid request body",
    })
  }
  const result = await service.clearAttempts(parsed.data)
  if (result.ok) {
    return jsonResponse(200, result.value)
  }
  return jsonResponse(errorStatus(result.error), result.error)
}

const handleTestSeed = async (
  req: Request,
  service: AuthService,
): Promise<Response> => {
  const body = await readJson(req)
  const parsed = SeedPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, {
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Invalid seed body",
    })
  }
  service.seedState(parsed.data.state)
  return jsonResponse(200, {
    seeded: true,
    username: parsed.data.state.username,
  })
}

export const createServer = async (
  opts: ServerOptions = {},
): Promise<ServerHandle> => {
  const service = opts.service ?? new AuthService()
  const port = opts.port ?? 0
  const hostname = opts.hostname ?? "127.0.0.1"

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url)

      if (req.method === "POST" && url.pathname === "/api/v1/auth/login") {
        return handleLogin(req, service)
      }

      if (
        req.method === "POST" &&
        url.pathname === "/api/v1/auth/attempts/clear"
      ) {
        return handleClearAttempts(req, service)
      }

      if (req.method === "POST" && url.pathname === "/__test__/seed") {
        return handleTestSeed(req, service)
      }

      if (req.method === "POST" && url.pathname === "/__test__/reset") {
        service.reset()
        return jsonResponse(200, { reset: true })
      }

      if (req.method === "GET" && url.pathname === "/health") {
        return jsonResponse(200, { status: "ok" })
      }

      return jsonResponse(404, { code: "NOT_FOUND", message: "No such route" })
    },
  })

  return {
    port: server.port,
    hostname: server.hostname,
    stop: async () => {
      await server.stop()
    },
  }
}

const DEFAULT_PORT = 3001
const DEFAULT_HOST = "127.0.0.1"

export const startServer = async (
  env: { PORT?: string; HOST?: string } = process.env,
): Promise<ServerHandle> => {
  const port = env.PORT ? Number.parseInt(env.PORT, 10) : DEFAULT_PORT
  const hostname = env.HOST ?? DEFAULT_HOST

  if (!Number.isFinite(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`)
  }

  return createServer({ port, hostname })
}
