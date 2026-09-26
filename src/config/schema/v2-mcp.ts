import { z } from "zod"

const McpTimeoutSchema = z.object({
  startup: z.number().optional(),
  catalog: z.number().optional(),
  execution: z.number().optional(),
})

/**
 * V2 `Mcp.OAuthConfig` is snake_case. The spelling is enforced rather than merely
 * accepted so a camelCase `clientId` is rejected instead of silently dropped.
 */
export const McpOAuthConfigSchema = z
  .object({
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
    scope: z.string().optional(),
    callback_port: z.number().optional(),
    redirect_uri: z.string().optional(),
    auth_server_metadata_url: z.string().optional(),
  })
  .strict();

export const McpServerConfigSchema = z.object({
  type: z.enum(["local", "remote"]).optional(),
  /** V2-native array form; a bare string with separate `args` is accepted as a V1 shape. */
  command: z.union([z.array(z.string()), z.string()]).optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  /** V2-native flag. Takes precedence over the V1 `enabled` alias. */
  disabled: z.boolean().optional(),
  /** V1 alias, inverted on the way out. */
  enabled: z.boolean().optional(),
  /** V2-native env record. */
  environment: z.record(z.string(), z.string()).optional(),
  /** V1 alias for `environment`. */
  env: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  /** `false` opts out of OAuth auto-detection; an object supplies credentials. */
  oauth: z.union([McpOAuthConfigSchema, z.literal(false)]).optional(),
  codemode: z.boolean().optional(),
  protocol: z.enum(["legacy", "auto", "2026-07-28"]).optional(),
  timeout: McpTimeoutSchema.optional(),
})

export const McpConfigSchema = z.object({
  /** V2 mcp.servers.* registry — keyed by server name; additive to the V1 built-in MCP list. */
  servers: z.record(z.string(), McpServerConfigSchema).optional(),
})

export type McpOAuthConfig = z.infer<typeof McpOAuthConfigSchema>
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>
export type McpConfig = z.infer<typeof McpConfigSchema>
