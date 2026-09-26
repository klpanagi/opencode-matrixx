import { Service } from "@opencode/client/service"

import { log } from "../../shared"

/** Port OpenCode serves on when nothing else is advertised. */
export const DEFAULT_SERVER_PORT = "4096"

export const SERVER_URL_ENV = "OPENCODE_SERVER_URL"
export const SERVER_PORT_ENV = "OPENCODE_PORT"

/**
 * How the server endpoint was found. Reported at setup so a best-effort guess
 * is never mistaken for a confirmed one.
 */
export type ServerEndpointSource = "env" | "discovered" | "port-fallback"

export type ResolvedServerEndpoint = {
  url: URL
  source: ServerEndpointSource
}

export type ServerEndpointOptions = {
  env?: Record<string, string | undefined>
  /** Reads the registered local service. Overridden in tests. */
  discover?: () => Promise<{ url: string } | undefined>
}

function portFallback(env: Record<string, string | undefined>): ResolvedServerEndpoint {
  return { url: new URL(`http://localhost:${env[SERVER_PORT_ENV] ?? DEFAULT_SERVER_PORT}`), source: "port-fallback" }
}

function fromEnv(env: Record<string, string | undefined>): ResolvedServerEndpoint | undefined {
  const raw = env[SERVER_URL_ENV]
  if (!raw) return undefined
  try {
    return { url: new URL(raw), source: "env" }
  } catch (error) {
    log("[server-endpoint] ignoring unparseable server URL", { raw, error })
    return undefined
  }
}

/**
 * Resolves the OpenCode server endpoint for a V2 plugin that has no client and
 * no `serverUrl` on its context.
 *
 * The V2 `Context` deliberately drops the V1 client, so the only way for a V2
 * host to be located is out of band. The order is: an explicit environment
 * override, then the registered local service, then the conventional port. The
 * last step is a guess and is labelled `port-fallback` so the caller can log it.
 */
export async function resolveServerEndpoint(
  options: ServerEndpointOptions = {}
): Promise<ResolvedServerEndpoint> {
  const env = options.env ?? process.env

  const fromEnvResult = fromEnv(env)
  if (fromEnvResult) return fromEnvResult

  const discover = options.discover ?? defaultDiscover
  try {
    const found = await discover()
    if (found?.url) return { url: new URL(found.url), source: "discovered" }
  } catch (error) {
    log("[server-endpoint] service discovery failed", { error })
  }

  return portFallback(env)
}

async function defaultDiscover(): Promise<{ url: string } | undefined> {
  const endpoint = await Service.discover()
  return endpoint ? { url: endpoint.url } : undefined
}
