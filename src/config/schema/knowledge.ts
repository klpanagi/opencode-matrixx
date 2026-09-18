import { z } from "zod"

export const DEFAULT_KNOWLEDGE_EXCLUDES: string[] = [
  ".*",
  "*.env",
  "*.docx",
  "*.pptx",
  "*.zip",
  "node_modules/**",
  ".publisync_env",
  ".alz_mongo_env",
]

export const KnowledgeHubSchema = z.object({
  name: z.string(),
  path: z.string(),
  index: z.string().default("_index.md"),
  scope: z.enum(["global", "project"]).default("global"),
  mode: z.enum(["router-only", "pinned"]).default("router-only"),
  exclude: z.array(z.string()).default([]),
})

export const KnowledgeConfigSchema = z.object({
  hubs: z.array(KnowledgeHubSchema).default([]),
})

export type KnowledgeHub = z.infer<typeof KnowledgeHubSchema>
export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>
