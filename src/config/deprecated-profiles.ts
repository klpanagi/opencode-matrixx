import { PROFILE_NAMES, type ProfileName } from "./profiles"

/**
 * Vendor-specific profiles that will be removed in v3.0.0. The 5 tier profiles
 * (free / budget / economy / balanced / performance) are kept for now and
 * replaced by the new preset system in v3.0.0.
 */
export const DEPRECATED_PROFILES: ReadonlyArray<ProfileName> = [
  "go",
  "xiaomi-ultimate",
  "go-ultimate",
  "go-trio",
  "go-duo",
] as const

export function isDeprecatedProfile(name: string): name is (typeof DEPRECATED_PROFILES)[number] {
  return (DEPRECATED_PROFILES as readonly string[]).includes(name) && (PROFILE_NAMES as readonly string[]).includes(name as ProfileName)
}

export function deprecationMessage(profile: ProfileName): string {
  return (
    `[deprecation] Profile "${profile}" is vendor-specific and will be removed in v3.0.0. ` +
    `Call \`migrateProfileToTiers("${profile}")\` (exported from \`matrixx/config\`) to get the equivalent ` +
    `tier-based config, then copy it into your matrixx.jsonc and remove the \`profile\` field.`
  )
}
