import type { RtkConfig } from "../config/schema/rtk"

export interface RtkEnforcement {
  enabled: boolean
  binaryPresent: boolean
  binaryPath: string
  active: boolean
}

export interface RtkEnforcementOptions {
  hookEnabled?: boolean
  which?: (binary: string) => string | null
}

/**
 * Single source of truth for RTK enforcement state.
 * Both the rtk-bash-rewriter registration gate and the agent prompt
 * builders (guidance text) derive from this — prompt and hook can never
 * disagree because they read the same resolved flags.
 */
export function resolveRtkEnforcement(
  rtk: RtkConfig | undefined,
  opts?: RtkEnforcementOptions,
): RtkEnforcement {
  const enabled = rtk?.enabled ?? false
  const binaryPath = rtk?.binary_path ?? "rtk"
  const which = opts?.which ?? ((bin: string) => Bun.which(bin))
  const hookEnabled = opts?.hookEnabled ?? true
  const binaryPresent = which(binaryPath) !== null
  return {
    enabled,
    binaryPresent,
    binaryPath,
    active: enabled && binaryPresent && hookEnabled,
  }
}
