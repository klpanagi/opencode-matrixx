import { z } from "zod"

/**
 * DCP (Dynamic Context Pruning) configuration.
 *
 * Controls the optional `/dcp-profile` slash command for switching between
 * predefined DCP profile tiers (economy/balanced/performance/ultimate).
 *
 * DCP must be installed as a plugin: `~/.config/opencode/node_modules/@tarquinen/opencode-dcp`
 */
export const DcpConfigSchema = z.object({
  /** Enable the DCP profile switcher. Default: true */
  enabled: z.boolean().default(true),
  /** Absolute path to the profile-switching shell script. Default: ~/.myopencode/dcp/switch-profile.sh */
  switch_script: z.string().optional(),
  /** Profile names available for switching. Default: ["economy", "balanced", "performance", "ultimate"] */
  profiles: z.array(z.string()).optional(),
  /** Default profile to activate when the command is invoked without arguments. Default: "balanced" */
  default_profile: z.string().optional(),
})

export type DcpConfig = z.infer<typeof DcpConfigSchema>
