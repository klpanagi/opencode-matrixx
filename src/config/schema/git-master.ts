import { z } from "zod"

export const GitMasterConfigSchema = z.object({
  /** Add a footer to commit messages (default: false). Can be boolean or custom string. */
  commit_footer: z.union([z.boolean(), z.string()]).default(false),
  /** Add "Co-authored-by" trailer to commit messages (default: false) */
  include_co_authored_by: z.boolean().default(false),
})

export type GitMasterConfig = z.infer<typeof GitMasterConfigSchema>
