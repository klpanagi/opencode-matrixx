import type { MatrixxConfig } from "../config/schema"

export const TASK_SYSTEM_DEFAULT = true as const

export function isTaskSystemEnabled(
  config: Partial<MatrixxConfig> | undefined | null,
): boolean {
  return config?.experimental?.task_system ?? TASK_SYSTEM_DEFAULT
}
